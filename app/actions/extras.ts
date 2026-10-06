"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/server/supabase";
import { safe, type ActionResult } from "@/lib/server/safe";
import { generateCaption, saveCaption } from "@/lib/server/captions";
import { createProject, generateScripts } from "@/lib/server/pipeline";
import { TARGET_MODELS } from "@/lib/schemas";

const uuid = z.string().uuid();

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/* ---------- caption pack ---------- */

export async function generateCaptionAction(projectId: string, steerNote?: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await generateCaption(uuid.parse(projectId), steerNote?.trim() || undefined);
  });
  revalidatePath("/w/[ws]/p/[id]", "layout");
  return res;
}

export async function saveCaptionAction(
  projectId: string,
  input: { caption: string; hashtags: string; on_screen_text: string },
): Promise<ActionResult> {
  const res = await safe(async () => {
    await saveCaption(uuid.parse(projectId), {
      caption: input.caption,
      hashtags: input.hashtags.split(/[\s,]+/).filter(Boolean),
      on_screen_text: input.on_screen_text,
    });
  });
  revalidatePath("/w/[ws]/p/[id]", "layout");
  return res;
}

/* ---------- library ---------- */

export async function setProjectTagsAction(projectId: string, tags: string[]): Promise<ActionResult> {
  const res = await safe(async () => {
    const clean = [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 12);
    must(await db().from("projects").update({ tags: clean }).eq("id", uuid.parse(projectId)).select("id").single(), "tags");
  });
  revalidatePath("/w/[ws]/library", "page");
  revalidatePath("/w/[ws]/p/[id]", "layout");
  return res;
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  const res = await safe(async () => {
    const id = uuid.parse(projectId);
    // remove stored files first; rows cascade
    const clips = (must(await db().from("clips").select("id").eq("project_id", id), "clips") as { id: string }[]).map((c) => c.id);
    if (clips.length) {
      const assets = must(await db().from("assets").select("kind,storage_path").in("clip_id", clips), "assets") as {
        kind: "image" | "video";
        storage_path: string;
      }[];
      for (const bucket of ["image", "video"] as const) {
        const paths = assets.filter((a) => a.kind === bucket).map((a) => a.storage_path);
        if (paths.length) await db().storage.from(bucket === "image" ? "images" : "videos").remove(paths);
      }
    }
    must(await db().from("projects").delete().eq("id", id).select("id").single(), "delete project");
  });
  revalidatePath("/w/[ws]/library", "page");
  revalidatePath("/w/[ws]", "page");
  return res;
}

/* ---------- calendar ---------- */

export async function addScheduledPost(fd: FormData) {
  const workspaceId = uuid.parse(str(fd, "workspace_id"));
  const title = str(fd, "title").trim();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(str(fd, "scheduled_for"));
  if (!title) return;
  must(
    await db()
      .from("scheduled_posts")
      .insert({
        workspace_id: workspaceId,
        title,
        scheduled_for: date,
        pillar: str(fd, "pillar") || null,
        project_id: str(fd, "project_id") || null,
      })
      .select("id")
      .single(),
    "add post",
  );
  revalidatePath(`/w/${str(fd, "slug")}/calendar`);
}

export async function setScheduledStatus(fd: FormData) {
  const status = z.enum(["planned", "posted", "skipped"]).parse(str(fd, "status"));
  must(
    await db().from("scheduled_posts").update({ status }).eq("id", uuid.parse(str(fd, "id"))).select("id").single(),
    "post status",
  );
  revalidatePath(`/w/${str(fd, "slug")}/calendar`);
}

export async function deleteScheduledPost(fd: FormData) {
  must(await db().from("scheduled_posts").delete().eq("id", uuid.parse(str(fd, "id"))).select("id").single(), "delete post");
  revalidatePath(`/w/${str(fd, "slug")}/calendar`);
}

/* ---------- performance log ---------- */

const int = (fd: FormData, key: string) => Math.max(0, Math.floor(Number(str(fd, key)) || 0));

export async function addMetric(fd: FormData) {
  must(
    await db()
      .from("post_metrics")
      .insert({
        project_id: uuid.parse(str(fd, "project_id")),
        posted_at: str(fd, "posted_at") || null,
        platform: str(fd, "platform") || "tiktok",
        url: str(fd, "url") || null,
        views: int(fd, "views"),
        likes: int(fd, "likes"),
        comments: int(fd, "comments"),
        shares: int(fd, "shares"),
        notes: str(fd, "notes") || null,
      })
      .select("id")
      .single(),
    "add metric",
  );
  // logging a post marks the project's clips as posted
  const clips = (
    must(await db().from("clips").select("id").eq("project_id", str(fd, "project_id")), "clips") as { id: string }[]
  ).map((c) => c.id);
  if (clips.length) await db().from("clips").update({ status: "posted" }).in("id", clips);
  revalidatePath(`/w/${str(fd, "slug")}/insights`);
}

export async function deleteMetric(fd: FormData) {
  must(await db().from("post_metrics").delete().eq("id", uuid.parse(str(fd, "id"))).select("id").single(), "delete metric");
  revalidatePath(`/w/${str(fd, "slug")}/insights`);
}

/* ---------- trend -> script ---------- */

export async function createProjectFromTrend(input: {
  workspaceId: string;
  title: string;
  idea: string;
  sourceUrl?: string;
  scriptCount?: number;
}): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  let projectId: string | undefined;
  try {
    const v = z
      .object({
        workspaceId: uuid,
        title: z.string().trim().min(1),
        idea: z.string().trim().min(10),
        sourceUrl: z.string().optional(),
        scriptCount: z.number().int().min(1).max(5).default(3),
      })
      .parse(input);
    const project = await createProject({
      workspaceId: v.workspaceId,
      idea: v.idea,
      title: v.title,
      targetModel: "veo",
      clipCount: null,
      clipSeconds: TARGET_MODELS.veo.clipSeconds,
      language: "Taglish",
      pillar: null,
      aspectRatio: "9:16",
      scriptCount: v.scriptCount,
    });
    projectId = project.id;
    await generateScripts({
      projectId,
      count: v.scriptCount,
      steerNote: "Adapt the trend's structure and rhythm to this character's own voice, setting and pillars. Do not copy lines.",
    });
    return { ok: true, projectId };
  } catch (e) {
    console.error("[createProjectFromTrend]", e);
    return { ok: false, projectId, error: e instanceof Error ? e.message : String(e) };
  }
}
