import "server-only";
import { generateJSON } from "@/lib/llm";
import { db, must } from "@/lib/server/supabase";
import {
  getClips,
  getPresets,
  getProject,
  getPromptContext,
  getScripts,
  resolveTemplate,
} from "@/lib/server/data";
import {
  buildSystemPrompt,
  maxClipSecondsFor,
  resolveClipSeconds,
  renderStill,
  scriptClipUserPrompt,
  scriptUserPrompt,
  stillBatchUserPrompt,
  stillSingleUserPrompt,
  type StillClipInput,
} from "@/lib/prompts/build";
import { ScriptClipRewrite, ScriptOptions, StillBatch, StillPrompt, type IdeaInput } from "@/lib/schemas";
import { checkStillPrompt, parseLabeledLines } from "@/lib/rules";
import type {
  Clip,
  ClipStatus,
  Project,
  ProjectStatus,
  Prompt,
  PromptKind,
  Script,
} from "@/lib/supabase/types";

const CLIP_RANK: Record<ClipStatus, number> = {
  draft: 0,
  still_prompted: 1,
  imaged: 2,
  video_prompted: 3,
  video_done: 4,
  posted: 5,
};

const PROJECT_RANK: Record<ProjectStatus, number> = { idea: 0, scripts: 1, stills: 2, videos: 3, finished: 4 };

/** Move a clip's status forward only. */
export async function advanceClip(clipId: string, to: ClipStatus) {
  const clip = must(await db().from("clips").select("status").eq("id", clipId).single(), "clip") as {
    status: ClipStatus;
  };
  if (CLIP_RANK[to] > CLIP_RANK[clip.status]) {
    must(await db().from("clips").update({ status: to }).eq("id", clipId).select("id").single(), "advance clip");
  }
}

export async function bumpProject(projectId: string, to: ProjectStatus) {
  const p = await getProject(projectId);
  if (PROJECT_RANK[to] > PROJECT_RANK[p.status]) {
    must(await db().from("projects").update({ status: to }).eq("id", projectId).select("id").single(), "bump project");
  }
}

/* ---------- Step 1 ---------- */

export async function createProject(input: IdeaInput): Promise<Project> {
  const title = input.title?.trim() || input.idea.trim().slice(0, 60);
  return must(
    await db()
      .from("projects")
      .insert({
        workspace_id: input.workspaceId,
        title,
        idea: input.idea.trim(),
        target_model: input.targetModel,
        language: input.language,
        pillar: input.pillar,
        aspect_ratio: input.aspectRatio,
        clip_count: input.clipCount,
        clip_seconds: input.clipSeconds,
        status: "scripts",
      })
      .select("*")
      .single(),
    "create project",
  );
}

/* ---------- Step 2: scripts ---------- */

export async function generateScripts(args: {
  projectId: string;
  count: number;
  steerNote?: string;
  /** Regenerate one script (new version of it) instead of a fresh set. */
  replaceScriptId?: string;
}): Promise<Script[]> {
  const project = await getProject(args.projectId);
  const [ctx, template, all] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "script"),
    getScripts(project.id),
  ]);

  const current = all.filter((s) => s.is_current);
  const replaced = args.replaceScriptId ? all.find((s) => s.id === args.replaceScriptId) : null;
  if (args.replaceScriptId && !replaced) throw new Error("Script not found");
  // Regenerate-all only touches scripts that are not picked.
  const toReplace = replaced ? [replaced] : current.filter((s) => !s.is_picked);
  const count = replaced ? 1 : args.count;

  const clipSeconds = resolveClipSeconds(project.target_model, project.clip_seconds);
  const { data } = await generateJSON(
    ScriptOptions,
    buildSystemPrompt(template, ctx),
    scriptUserPrompt({
      idea: project.idea,
      count,
      clipCount: project.clip_count,
      targetModel: project.target_model,
      clipSeconds,
      language: project.language,
      pillar: project.pillar,
      aspectRatio: project.aspect_ratio,
      steerNote: args.steerNote,
      previous: replaced
        ? { title: replaced.title, hook: replaced.hook, clips: replaced.body.clips }
        : undefined,
    }),
    { step: "script", projectId: project.id },
  );

  const options = data.options.slice(0, count);

  if (toReplace.length) {
    must(
      await db()
        .from("scripts")
        .update({ is_current: false })
        .in(
          "id",
          toReplace.map((s) => s.id),
        )
        .select("id"),
      "retire scripts",
    );
  }

  const rows = options.map((o, i) => {
    const parent = toReplace[i] ?? null;
    return {
      project_id: project.id,
      title: o.title,
      hook: o.hook,
      body: {
        clips: o.clips.map((c) => ({ ...c, duration_s: clipSeconds })),
      },
      steer_note: args.steerNote?.trim() || null,
      version: parent ? parent.version + 1 : 1,
      parent_id: parent?.id ?? null,
      is_current: true,
      is_picked: false,
    };
  });
  return must(await db().from("scripts").insert(rows).select("*"), "insert scripts");
}

/** Rewrite one clip and store a new version of the script. Other clips stay as written. */
export async function regenerateScriptClip(args: {
  projectId: string;
  scriptId: string;
  clipIndex: number;
  steerNote?: string;
}): Promise<Script> {
  const project = await getProject(args.projectId);
  const [ctx, template, all] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "script"),
    getScripts(project.id),
  ]);
  const current = all.find((s) => s.id === args.scriptId);
  if (!current) throw new Error("Script not found");
  const clips = current.body.clips;
  if (args.clipIndex < 0 || args.clipIndex >= clips.length) throw new Error("Clip not found");

  const { data } = await generateJSON(
    ScriptClipRewrite,
    buildSystemPrompt(template, ctx),
    scriptClipUserPrompt({
      idea: project.idea,
      language: project.language,
      title: current.title,
      hook: current.hook,
      clips,
      clipIndex: args.clipIndex,
      steerNote: args.steerNote,
    }),
    { step: "script", projectId: project.id },
  );

  const dialogue = data.dialogue.trim();
  const action = data.action.trim();
  const nextClips = clips.map((c, i) => (i === args.clipIndex ? { ...c, dialogue, action } : c));
  const note = args.steerNote?.trim();
  const steer = note ? `clip ${args.clipIndex + 1}: ${note}` : `clip ${args.clipIndex + 1}`;

  must(await db().from("scripts").update({ is_current: false }).eq("id", current.id).select("id"), "retire scripts");

  return must(
    await db()
      .from("scripts")
      .insert({
        project_id: project.id,
        title: current.title,
        hook: args.clipIndex === 0 ? dialogue : current.hook,
        body: { clips: nextClips },
        steer_note: steer,
        version: current.version + 1,
        parent_id: current.id,
        is_current: true,
        is_picked: false,
      })
      .select("*")
      .single(),
    "insert scripts",
  );
}

/** Make an older version the current one in its family. */
export async function restoreScript(scriptId: string) {
  const target = must(await db().from("scripts").select("*").eq("id", scriptId).single(), "script") as Script;
  const all = await getScripts(target.project_id);
  const byId = new Map(all.map((s) => [s.id, s]));
  // family = ancestors + descendants of target
  const family = new Set<string>([target.id]);
  let p = target.parent_id;
  while (p) {
    family.add(p);
    p = byId.get(p)?.parent_id ?? null;
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all) {
      if (s.parent_id && family.has(s.parent_id) && !family.has(s.id)) {
        family.add(s.id);
        grew = true;
      }
    }
  }
  must(await db().from("scripts").update({ is_current: false }).in("id", [...family]).select("id"), "retire family");
  must(await db().from("scripts").update({ is_current: true }).eq("id", scriptId).select("id").single(), "restore");
}

export async function updateScript(
  scriptId: string,
  patch: { title: string; hook: string; clips: { dialogue: string; action: string; duration_s: number }[] },
) {
  const current = must(
    await db().from("scripts").select("project_id").eq("id", scriptId).single(),
    "script",
  ) as { project_id: string };
  const project = await getProject(current.project_id);
  const cap = maxClipSecondsFor(project.target_model);
  const clips = patch.clips.map((c) => ({
    ...c,
    duration_s: Math.min(Math.max(c.duration_s, 2), cap),
  }));
  const s = must(
    await db()
      .from("scripts")
      .update({ title: patch.title, hook: patch.hook, body: { clips } })
      .eq("id", scriptId)
      .select("*")
      .single(),
    "update script",
  ) as Script;
  if (s.is_picked) {
    // keep clips in sync with the picked script
    const rows = await getClips(s.project_id, s.id);
    for (const c of rows) {
      const src = clips[c.idx];
      if (!src) continue;
      must(
        await db()
          .from("clips")
          .update({ dialogue: src.dialogue, action: src.action, duration_s: src.duration_s })
          .eq("id", c.id)
          .select("id")
          .single(),
        "sync clip",
      );
    }
  }
}

export async function pickScript(scriptId: string): Promise<Project> {
  const script = must(await db().from("scripts").select("*").eq("id", scriptId).single(), "script") as Script;
  const project = await getProject(script.project_id);

  const existing = await getClips(project.id);
  const sameScript = existing.length > 0 && existing.every((c) => c.script_id === script.id);
  if (!sameScript) {
    if (existing.length) {
      must(await db().from("clips").delete().eq("project_id", project.id).select("id"), "clear old clips");
    }
    const presets = await getPresets(project.workspace_id);
    const loc = presets.find((p) => p.kind === "location") ?? null;
    const ward = presets.find((p) => p.kind === "wardrobe") ?? null;
    const rows = script.body.clips.map((c, idx) => ({
      project_id: project.id,
      script_id: script.id,
      idx,
      dialogue: c.dialogue,
      action: c.action,
      duration_s: c.duration_s,
      // The pack keeps the same environment/outfit unless changed per clip later.
      location_preset_id: loc?.id ?? null,
      wardrobe_preset_id: ward?.id ?? null,
      status: "draft",
    }));
    must(await db().from("clips").insert(rows).select("id"), "create clips");
  }

  must(await db().from("scripts").update({ is_picked: false }).eq("project_id", project.id).select("id"), "unpick");
  must(await db().from("scripts").update({ is_picked: true, is_current: true }).eq("id", script.id).select("id").single(), "pick");
  must(
    await db()
      .from("projects")
      .update({ picked_script_id: script.id })
      .eq("id", project.id)
      .select("id")
      .single(),
    "set picked",
  );
  await bumpProject(project.id, "stills");
  return project;
}

/* ---------- Step 3: stills ---------- */

/** Store a new prompt version and mark it current. Old versions are kept. */
export async function insertPromptVersion(args: {
  clipId: string;
  kind: PromptKind;
  body: string;
  checker?: unknown[];
}): Promise<Prompt> {
  const prev = (
    must(
      await db()
        .from("prompts")
        .select("*")
        .eq("clip_id", args.clipId)
        .eq("kind", args.kind)
        .order("version", { ascending: false })
        .limit(1),
      "prev prompt",
    ) as Prompt[]
  )[0];
  if (prev) {
    must(
      await db().from("prompts").update({ is_current: false }).eq("clip_id", args.clipId).eq("kind", args.kind).select("id"),
      "retire prompts",
    );
  }
  return must(
    await db()
      .from("prompts")
      .insert({
        clip_id: args.clipId,
        kind: args.kind,
        body: args.body,
        version: (prev?.version ?? 0) + 1,
        parent_id: prev?.id ?? null,
        is_current: true,
        checker: args.checker ?? [],
      })
      .select("*")
      .single(),
    "insert prompt",
  );
}

export async function restorePrompt(promptId: string) {
  const p = must(await db().from("prompts").select("*").eq("id", promptId).single(), "prompt") as Prompt;
  must(await db().from("prompts").update({ is_current: false }).eq("clip_id", p.clip_id).eq("kind", p.kind).select("id"), "retire");
  must(await db().from("prompts").update({ is_current: true }).eq("id", promptId).select("id").single(), "restore prompt");
}

async function stillInputs(project: Project, clips: Clip[]): Promise<StillClipInput[]> {
  const presets = await getPresets(project.workspace_id);
  const byId = new Map(presets.map((p) => [p.id, p]));
  return clips.map((c) => ({
    idx: c.idx,
    dialogue: c.dialogue,
    action: c.action,
    durationS: c.duration_s,
    location: c.location_preset_id ? (byId.get(c.location_preset_id) ?? null) : null,
    wardrobe: c.wardrobe_preset_id ? (byId.get(c.wardrobe_preset_id) ?? null) : null,
  }));
}

async function pickedScriptTitle(project: Project): Promise<string> {
  if (!project.picked_script_id) throw new Error("Pick a script first");
  const s = must(await db().from("scripts").select("title").eq("id", project.picked_script_id).single(), "script") as {
    title: string;
  };
  return s.title;
}

export async function generateStillPrompts(projectId: string, steerNote?: string): Promise<number> {
  const project = await getProject(projectId);
  const clips = await getClips(project.id, project.picked_script_id);
  if (!clips.length) throw new Error("No clips yet. Pick a script first.");
  const [ctx, template, inputs, scriptTitle] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "still"),
    stillInputs(project, clips),
    pickedScriptTitle(project),
  ]);

  const { data } = await generateJSON(
    StillBatch,
    buildSystemPrompt(template, ctx),
    stillBatchUserPrompt({ scriptTitle, aspectRatio: project.aspect_ratio, clips: inputs, steerNote }),
    { step: "still", projectId: project.id },
  );

  let written = 0;
  for (const clip of clips) {
    const hit = data.clips.find((c) => c.idx === clip.idx);
    if (!hit) continue;
    const body = renderStill(ctx.identity, { ...hit.prompt, aspect_ratio: hit.prompt.aspect_ratio || project.aspect_ratio });
    await insertPromptVersion({ clipId: clip.id, kind: "still", body, checker: checkStillPrompt(body, { identity: ctx.identity }) });
    await advanceClip(clip.id, "still_prompted");
    written++;
  }
  if (written < clips.length) {
    throw new Error(`The model returned prompts for ${written} of ${clips.length} clips. Regenerate the missing ones.`);
  }
  return written;
}

export async function regenerateStillPrompt(clipId: string, steerNote?: string): Promise<void> {
  const clip = must(await db().from("clips").select("*").eq("id", clipId).single(), "clip") as Clip;
  const project = await getProject(clip.project_id);
  const clips = await getClips(project.id, project.picked_script_id);
  const [ctx, template, inputs, scriptTitle] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "still"),
    stillInputs(project, clips),
    pickedScriptTitle(project),
  ]);

  const { data: promptRows } = await db()
    .from("prompts")
    .select("clip_id,body,is_current")
    .in("clip_id", clips.map((c) => c.id))
    .eq("kind", "still")
    .eq("is_current", true);
  const bodies = new Map((promptRows ?? []).map((r) => [r.clip_id as string, r.body as string]));

  const neighbors = clips
    .filter((c) => Math.abs(c.idx - clip.idx) === 1)
    .map((c) => {
      const camera = parseLabeledLines(bodies.get(c.id) ?? "").find((l) => l.label === "Camera")?.value ?? "";
      return { idx: c.idx, camera };
    })
    .filter((n) => n.camera);

  const mine = inputs.find((i) => i.idx === clip.idx)!;
  const { data } = await generateJSON(
    StillPrompt,
    buildSystemPrompt(template, ctx),
    stillSingleUserPrompt({
      scriptTitle,
      aspectRatio: project.aspect_ratio,
      clip: mine,
      previousPrompt: bodies.get(clip.id),
      neighbors,
      steerNote,
    }),
    { step: "still", projectId: project.id },
  );
  const body = renderStill(ctx.identity, { ...data, aspect_ratio: data.aspect_ratio || project.aspect_ratio });
  await insertPromptVersion({ clipId: clip.id, kind: "still", body, checker: checkStillPrompt(body, { identity: ctx.identity }) });
  await advanceClip(clip.id, "still_prompted");
}
