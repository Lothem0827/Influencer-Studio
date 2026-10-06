"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, must } from "@/lib/server/supabase";
import { safe, type ActionResult } from "@/lib/server/safe";
import {
  createProject,
  generateScripts,
  generateStillPrompts,
  regenerateScriptClip,
  insertPromptVersion,
  pickScript,
  regenerateStillPrompt,
  restorePrompt,
  restoreScript,
  updateScript,
  advanceClip,
} from "@/lib/server/pipeline";
import { getPromptContext, getProject } from "@/lib/server/data";
import { IdeaInput } from "@/lib/schemas";
import { checkStillPrompt } from "@/lib/rules";

function refresh(projectId: string) {
  revalidatePath("/w/[ws]/p/[id]", "layout");
  void projectId;
}

/** Step 1: create the project and generate the first scripts. Project survives an LLM failure. */
export async function startProject(
  raw: unknown,
): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  const parsed = IdeaInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  let projectId: string | undefined;
  try {
    const project = await createProject(parsed.data);
    projectId = project.id;
    await generateScripts({ projectId, count: parsed.data.scriptCount });
    return { ok: true, projectId };
  } catch (e) {
    console.error("[startProject]", e);
    return { ok: false, projectId, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generateScriptsAction(input: {
  projectId: string;
  count: number;
  steerNote?: string;
}): Promise<ActionResult> {
  const args = z
    .object({ projectId: z.string().uuid(), count: z.number().int().min(1).max(5), steerNote: z.string().optional() })
    .parse(input);
  const res = await safe(async () => {
    await generateScripts(args);
  });
  refresh(args.projectId);
  return res;
}

export async function regenerateScriptAction(input: {
  projectId: string;
  scriptId: string;
  steerNote?: string;
}): Promise<ActionResult> {
  const args = z
    .object({ projectId: z.string().uuid(), scriptId: z.string().uuid(), steerNote: z.string().optional() })
    .parse(input);
  const res = await safe(async () => {
    await generateScripts({ projectId: args.projectId, count: 1, steerNote: args.steerNote, replaceScriptId: args.scriptId });
  });
  refresh(args.projectId);
  return res;
}

export async function regenerateScriptClipAction(input: {
  projectId: string;
  scriptId: string;
  clipIndex: number;
  steerNote?: string;
}): Promise<ActionResult> {
  const args = z
    .object({
      projectId: z.string().uuid(),
      scriptId: z.string().uuid(),
      clipIndex: z.number().int().min(0).max(9),
      steerNote: z.string().optional(),
    })
    .parse(input);
  const res = await safe(async () => {
    await regenerateScriptClip(args);
  });
  refresh(args.projectId);
  return res;
}

export async function restoreScriptAction(scriptId: string, projectId: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await restoreScript(z.string().uuid().parse(scriptId));
  });
  refresh(projectId);
  return res;
}

const ScriptEdit = z.object({
  scriptId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1),
  hook: z.string(),
  clips: z
    .array(
      z.object({
        dialogue: z.string().trim().min(1, "Every clip needs dialogue"),
        action: z.string(),
        duration_s: z.number().int().min(2).max(30),
      }),
    )
    .min(1)
    .max(10),
});

export async function saveScriptAction(input: z.infer<typeof ScriptEdit>): Promise<ActionResult> {
  const res = await safe(async () => {
    const v = ScriptEdit.parse(input);
    await updateScript(v.scriptId, { title: v.title, hook: v.hook, clips: v.clips });
  });
  refresh(input.projectId);
  return res;
}

export async function pickScriptAction(scriptId: string): Promise<ActionResult<{ projectId: string }>> {
  const res = await safe(async () => {
    const p = await pickScript(z.string().uuid().parse(scriptId));
    return { projectId: p.id };
  });
  if (res.ok && res.data) refresh(res.data.projectId);
  return res;
}

/* ---------- stills ---------- */

export async function generateStillsAction(projectId: string, steerNote?: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await generateStillPrompts(z.string().uuid().parse(projectId), steerNote);
  });
  refresh(projectId);
  return res;
}

export async function regenerateStillAction(clipId: string, projectId: string, steerNote?: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await regenerateStillPrompt(z.string().uuid().parse(clipId), steerNote);
  });
  refresh(projectId);
  return res;
}

export async function saveStillAction(clipId: string, projectId: string, body: string): Promise<ActionResult> {
  const res = await safe(async () => {
    const text = z.string().trim().min(1).parse(body);
    const project = await getProject(projectId);
    const ctx = await getPromptContext(project.workspace_id);
    await insertPromptVersion({
      clipId,
      kind: "still",
      body: text,
      checker: checkStillPrompt(text, { identity: ctx.identity }),
    });
    await advanceClip(clipId, "still_prompted");
  });
  refresh(projectId);
  return res;
}

export async function restorePromptAction(promptId: string, projectId: string): Promise<ActionResult> {
  const res = await safe(async () => {
    await restorePrompt(z.string().uuid().parse(promptId));
  });
  refresh(projectId);
  return res;
}

export async function updateProjectBriefAction(input: {
  projectId: string;
  title: string;
  idea: string;
  pillar: string | null;
}): Promise<ActionResult> {
  const args = z
    .object({
      projectId: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      idea: z.string().trim().min(3, "Write at least a few words"),
      pillar: z.string().trim().nullable(),
    })
    .parse(input);
  const res = await safe(async () => {
    must(
      await db()
        .from("projects")
        .update({ title: args.title, idea: args.idea, pillar: args.pillar })
        .eq("id", args.projectId)
        .select("id")
        .single(),
      "update project",
    );
  });
  refresh(args.projectId);
  return res;
}

export async function setClipPresetAction(
  clipId: string,
  projectId: string,
  kind: "location" | "wardrobe",
  presetId: string | null,
): Promise<ActionResult> {
  const res = await safe(async () => {
    const col = kind === "location" ? "location_preset_id" : "wardrobe_preset_id";
    must(await db().from("clips").update({ [col]: presetId }).eq("id", clipId).select("id").single(), "set preset");
  });
  refresh(projectId);
  return res;
}
