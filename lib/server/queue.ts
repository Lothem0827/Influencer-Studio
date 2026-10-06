import "server-only";
import { db, must } from "@/lib/server/supabase";
import { bucketFor, signedUrl } from "@/lib/server/data";
import type { Asset, Clip, IdentityPack, Project, Prompt, SendQueueItem } from "@/lib/supabase/types";

export interface ExtensionQueueItem {
  id: string;
  status: "queued" | "sent" | "done";
  kind: "still" | "video";
  prompt: string;
  clipId: string;
  clipIdx: number;
  durationS: number;
  projectId: string;
  projectTitle: string;
  aspectRatio: string;
  workspaceName: string;
  /** Signed URL of the clip's selected still (video prompts) */
  refImageUrl: string | null;
  /** Signed or public URL of the character sheet (still prompts) */
  characterSheetUrl: string | null;
  createdAt: string;
}

export async function listQueue(): Promise<ExtensionQueueItem[]> {
  const rows = must(
    await db().from("send_queue").select("*").in("status", ["queued", "sent"]).order("created_at", { ascending: true }).limit(100),
    "queue",
  ) as SendQueueItem[];
  if (!rows.length) return [];

  const prompts = must(await db().from("prompts").select("*").in("id", rows.map((r) => r.prompt_id)), "prompts") as Prompt[];
  const clips = must(await db().from("clips").select("*").in("id", [...new Set(rows.map((r) => r.clip_id))]), "clips") as Clip[];
  const projects = must(
    await db().from("projects").select("*").in("id", [...new Set(clips.map((c) => c.project_id))]),
    "projects",
  ) as Project[];
  const workspaces = must(
    await db().from("workspaces").select("id,name").in("id", [...new Set(projects.map((p) => p.workspace_id))]),
    "workspaces",
  ) as { id: string; name: string }[];
  const identities = must(
    await db().from("identity_packs").select("workspace_id,character_sheet_url").in("workspace_id", workspaces.map((w) => w.id)),
    "identities",
  ) as Pick<IdentityPack, "workspace_id" | "character_sheet_url">[];
  const refIds = rows.map((r) => r.ref_asset_id).filter(Boolean) as string[];
  const assets = refIds.length
    ? (must(await db().from("assets").select("*").in("id", refIds), "assets") as Asset[])
    : [];

  const out: ExtensionQueueItem[] = [];
  for (const r of rows) {
    const prompt = prompts.find((p) => p.id === r.prompt_id);
    const clip = clips.find((c) => c.id === r.clip_id);
    const project = projects.find((p) => p.id === clip?.project_id);
    if (!prompt || !clip || !project) continue;
    const ws = workspaces.find((w) => w.id === project.workspace_id);
    const asset = assets.find((a) => a.id === r.ref_asset_id);
    out.push({
      id: r.id,
      status: r.status,
      kind: prompt.kind,
      prompt: prompt.body,
      clipId: clip.id,
      clipIdx: clip.idx,
      durationS: clip.duration_s,
      projectId: project.id,
      projectTitle: project.title,
      aspectRatio: project.aspect_ratio,
      workspaceName: ws?.name ?? "",
      refImageUrl: asset ? await signedUrl(bucketFor(asset.kind), asset.storage_path, 900) : null,
      characterSheetUrl: prompt.kind === "still" ? (identities.find((i) => i.workspace_id === project.workspace_id)?.character_sheet_url ?? null) : null,
      createdAt: r.created_at,
    });
  }
  return out;
}

export interface ExtensionTarget {
  projectId: string;
  projectTitle: string;
  clips: { id: string; idx: number }[];
}

/** Recent projects with clips, so "Use this" can target a clip without a queue item. */
export async function listTargets(): Promise<ExtensionTarget[]> {
  const projects = must(
    await db().from("projects").select("id,title,picked_script_id").not("picked_script_id", "is", null).order("created_at", { ascending: false }).limit(8),
    "projects",
  ) as { id: string; title: string; picked_script_id: string }[];
  if (!projects.length) return [];
  const clips = must(
    await db().from("clips").select("id,idx,project_id,script_id").in("project_id", projects.map((p) => p.id)).order("idx"),
    "clips",
  ) as { id: string; idx: number; project_id: string; script_id: string }[];
  return projects.map((p) => ({
    projectId: p.id,
    projectTitle: p.title,
    clips: clips.filter((c) => c.project_id === p.id && c.script_id === p.picked_script_id).map((c) => ({ id: c.id, idx: c.idx })),
  }));
}
