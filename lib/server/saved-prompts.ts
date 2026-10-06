import "server-only";
import { randomUUID } from "node:crypto";
import { validateMime } from "@/lib/server/assets";
import { bucketFor, signedUrl } from "@/lib/server/data";
import { db, must } from "@/lib/server/supabase";
import type { Asset, AssetKind, PromptKind, SavedPrompt } from "@/lib/supabase/types";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const MAX_BYTES: Record<AssetKind, number> = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
};

export function sampleKindFor(kind: PromptKind): AssetKind {
  return kind === "still" ? "image" : "video";
}

function extFor(mime: string, kind: AssetKind): string {
  return EXT_BY_MIME[mime] ?? (kind === "image" ? "png" : "mp4");
}

function mimeForExt(ext: string, kind: AssetKind): string {
  const match = Object.entries(EXT_BY_MIME).find(([, value]) => value === ext);
  return match?.[0] ?? (kind === "image" ? "image/png" : "video/mp4");
}

/** Upload a sample into Storage. Does not create a clip asset or change project status. */
export async function uploadSampleFile(args: {
  workspaceId: string;
  savedId: string;
  promptKind: PromptKind;
  data: ArrayBuffer | Uint8Array;
  mimeType: string;
}): Promise<{ path: string; sampleKind: AssetKind }> {
  const sampleKind = sampleKindFor(args.promptKind);
  const mime = validateMime(sampleKind, args.mimeType);
  if (args.data.byteLength > MAX_BYTES[sampleKind]) {
    throw new Error(`Sample is larger than ${sampleKind === "image" ? "20" : "200"} MB`);
  }
  const path = `saved/${args.workspaceId}/${args.savedId}-${randomUUID()}.${extFor(mime, sampleKind)}`;
  const up = await db().storage.from(bucketFor(sampleKind)).upload(path, args.data, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) throw new Error(`Sample upload failed: ${up.error.message}`);
  return { path, sampleKind };
}

/** Copy a clip's selected file so the library sample survives if the clip is deleted. */
export async function copyAssetSample(args: {
  workspaceId: string;
  savedId: string;
  promptKind: PromptKind;
  assetId: string;
}): Promise<{ path: string; sampleKind: AssetKind }> {
  const asset = must(await db().from("assets").select("*").eq("id", args.assetId).single(), "sample asset") as Asset;
  const sampleKind = sampleKindFor(args.promptKind);
  if (asset.kind !== sampleKind) {
    throw new Error(sampleKind === "image" ? "A still prompt sample must be an image" : "A video prompt sample must be a video");
  }
  const clip = must(await db().from("clips").select("project_id").eq("id", asset.clip_id).single(), "clip") as {
    project_id: string;
  };
  const project = must(
    await db().from("projects").select("workspace_id").eq("id", clip.project_id).single(),
    "project",
  ) as { workspace_id: string };
  if (project.workspace_id !== args.workspaceId) throw new Error("That sample belongs to another workspace");

  const downloaded = await db().storage.from(bucketFor(asset.kind)).download(asset.storage_path);
  if (downloaded.error || !downloaded.data) {
    throw new Error(`Sample copy failed: ${downloaded.error?.message ?? "empty file"}`);
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const ext = asset.storage_path.split(".").pop()?.toLowerCase() || extFor("", sampleKind);
  const path = `saved/${args.workspaceId}/${args.savedId}-${randomUUID()}.${ext}`;
  const up = await db().storage.from(bucketFor(sampleKind)).upload(path, bytes, {
    contentType: mimeForExt(ext, sampleKind),
    upsert: false,
  });
  if (up.error) throw new Error(`Sample copy failed: ${up.error.message}`);
  return { path, sampleKind };
}

export async function removeSampleFile(kind: AssetKind | null, path: string | null) {
  if (!kind || !path) return;
  await db().storage.from(bucketFor(kind)).remove([path]);
}

export async function assertSourcePrompt(promptId: string, workspaceId: string) {
  const prompt = must(await db().from("prompts").select("clip_id").eq("id", promptId).single(), "prompt") as {
    clip_id: string;
  };
  const clip = must(await db().from("clips").select("project_id").eq("id", prompt.clip_id).single(), "clip") as {
    project_id: string;
  };
  const project = must(
    await db().from("projects").select("workspace_id").eq("id", clip.project_id).single(),
    "project",
  ) as { workspace_id: string };
  if (project.workspace_id !== workspaceId) throw new Error("That prompt belongs to another workspace");
}

export async function listSavedPrompts(
  workspaceId: string,
  filters: { q?: string; kind?: string },
): Promise<SavedPrompt[]> {
  let query = db()
    .from("saved_prompts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (filters.kind === "still" || filters.kind === "video") query = query.eq("kind", filters.kind);
  let rows = must(await query, "saved prompts") as SavedPrompt[];
  const q = filters.q?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  return rows;
}

export async function signSavedPrompts(rows: SavedPrompt[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    rows.map(async (row) => {
      if (!row.sample_kind || !row.sample_path) return;
      const url = await signedUrl(bucketFor(row.sample_kind), row.sample_path);
      if (url) out[row.id] = url;
    }),
  );
  return out;
}
