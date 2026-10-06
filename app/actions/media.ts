"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/server/supabase";
import { safe, type ActionResult } from "@/lib/server/safe";
import { deleteAsset, selectAsset } from "@/lib/server/assets";
import { generateVideoPrompt } from "@/lib/server/video";
import { getPromptContext, getProject } from "@/lib/server/data";
import { advanceClip, bumpProject, insertPromptVersion } from "@/lib/server/pipeline";
import { checkVideoPrompt } from "@/lib/rules";
import type { Clip, ClipStatus } from "@/lib/supabase/types";

const uuid = z.string().uuid();

function refresh() {
  revalidatePath("/w/[ws]/p/[id]", "layout");
}

export async function generateVideoPromptAction(clipId: string, steerNote?: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await generateVideoPrompt(uuid.parse(clipId), steerNote?.trim() || undefined);
  });
  refresh();
  return res;
}

export async function saveVideoPromptAction(clipId: string, projectId: string, body: string): Promise<ActionResult> {
  const res = await safe(async () => {
    const text = z.string().trim().min(1).parse(body);
    const clip = must(await db().from("clips").select("*").eq("id", uuid.parse(clipId)).single(), "clip") as Clip;
    const project = await getProject(projectId);
    const ctx = await getPromptContext(project.workspace_id);
    await insertPromptVersion({
      clipId,
      kind: "video",
      body: text,
      checker: checkVideoPrompt(text, { identity: ctx.identity, dialogue: clip.dialogue, durationS: clip.duration_s }),
    });
    await advanceClip(clipId, "video_prompted");
    await bumpProject(projectId, "videos");
  });
  refresh();
  return res;
}

export async function selectAssetAction(assetId: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await selectAsset(uuid.parse(assetId));
  });
  refresh();
  return res;
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await deleteAsset(uuid.parse(assetId));
  });
  refresh();
  return res;
}

export async function setClipStatusAction(clipId: string, status: ClipStatus): Promise<ActionResult> {
  const res = await safe(async () => {
    const s = z.enum(["draft", "still_prompted", "imaged", "video_prompted", "video_done", "posted"]).parse(status);
    must(await db().from("clips").update({ status: s }).eq("id", uuid.parse(clipId)).select("id").single(), "set status");
  });
  refresh();
  return res;
}
