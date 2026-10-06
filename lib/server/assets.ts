import "server-only";
import { randomUUID } from "node:crypto";
import { db, must } from "@/lib/server/supabase";
import { advanceClip, bumpProject } from "@/lib/server/pipeline";
import { bucketFor } from "@/lib/server/data";
import { validateUpload } from "@/lib/media";
import type { Asset, AssetKind, AssetSource, Clip } from "@/lib/supabase/types";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Upload a file to Storage, create the asset row, and advance clip/project status. */
export async function saveAsset(args: {
  clipId: string;
  kind: AssetKind;
  source: AssetSource;
  data: ArrayBuffer | Uint8Array;
  mimeType: string;
  filename?: string;
  flowUrl?: string | null;
}): Promise<Asset> {
  const checked = validateUpload(args.kind, {
    type: args.mimeType,
    name: args.filename,
    size: args.data.byteLength,
  });
  if (!checked.ok) throw new Error(checked.error);
  const mime = checked.mime;
  const clip = must(await db().from("clips").select("*").eq("id", args.clipId).single(), "clip") as Clip;
  const ext = EXT_BY_MIME[mime] ?? mime.split("/")[1] ?? "bin";
  const path = `${clip.project_id}/${clip.id}/${randomUUID()}.${ext}`;

  const up = await db()
    .storage.from(bucketFor(args.kind))
    .upload(path, args.data, { contentType: mime, upsert: false });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  if (args.kind === "image") {
    // newest image becomes the selected still
    await db().from("assets").update({ is_selected: false }).eq("clip_id", clip.id).eq("kind", "image");
  } else {
    await db().from("assets").update({ is_selected: false }).eq("clip_id", clip.id).eq("kind", "video");
  }

  const asset = must(
    await db()
      .from("assets")
      .insert({
        clip_id: clip.id,
        kind: args.kind,
        storage_path: path,
        source: args.source,
        flow_url: args.flowUrl ?? null,
        is_selected: true,
      })
      .select("*")
      .single(),
    "insert asset",
  ) as Asset;

  if (args.kind === "image") {
    await advanceClip(clip.id, "imaged");
    await bumpProject(clip.project_id, "videos");
  } else {
    await advanceClip(clip.id, "video_done");
    await bumpProject(clip.project_id, "videos");
  }
  return asset;
}

export async function selectAsset(assetId: string) {
  const a = must(await db().from("assets").select("*").eq("id", assetId).single(), "asset") as Asset;
  await db().from("assets").update({ is_selected: false }).eq("clip_id", a.clip_id).eq("kind", a.kind);
  must(await db().from("assets").update({ is_selected: true }).eq("id", assetId).select("id").single(), "select asset");
}

export async function deleteAsset(assetId: string) {
  const a = must(await db().from("assets").select("*").eq("id", assetId).single(), "asset") as Asset;
  await db().storage.from(bucketFor(a.kind)).remove([a.storage_path]);
  must(await db().from("assets").delete().eq("id", assetId).select("id").single(), "delete asset");
  // promote the newest remaining asset of the same kind if none is selected
  const rest = (
    must(
      await db().from("assets").select("*").eq("clip_id", a.clip_id).eq("kind", a.kind).order("created_at", { ascending: false }),
      "remaining assets",
    ) as Asset[]
  );
  if (rest.length && !rest.some((r) => r.is_selected)) {
    await db().from("assets").update({ is_selected: true }).eq("id", rest[0].id);
  }
}

export async function downloadAssetBase64(asset: Asset): Promise<{ mimeType: string; data: string }> {
  const { data, error } = await db().storage.from(bucketFor(asset.kind)).download(asset.storage_path);
  if (error || !data) throw new Error(`Could not read the image from storage: ${error?.message ?? "empty"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return { mimeType: data.type || "image/png", data: buf.toString("base64") };
}
