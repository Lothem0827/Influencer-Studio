import type { HouseRule, IdentityPack, Preset, Workspace } from "@/lib/supabase/types";
import { LANGUAGES, TARGET_MODELS, type StillPrompt, type VideoPrompt } from "@/lib/schemas";
import { wordsPerSecond } from "@/lib/rules";

export interface PromptContext {
  workspace: Workspace;
  identity: IdentityPack | null;
  houseRules: HouseRule[];
}

/** system prompt = template + identity pack + house rules */
export function buildSystemPrompt(template: string, ctx: PromptContext): string {
  const parts = [template.trim()];
  const id = ctx.identity;
  const lines: string[] = [`CHARACTER: ${ctx.workspace.name}${ctx.workspace.niche ? ` (${ctx.workspace.niche})` : ""}`];
  if (id) {
    if (id.appearance_lock) lines.push(`Appearance lock (verbatim): ${id.appearance_lock}`);
    if (id.wardrobe_dna) lines.push(`Wardrobe DNA: ${id.wardrobe_dna}`);
    if (id.palette) lines.push(`Palette: ${id.palette}`);
    if (id.voice) lines.push(`Voice / personality: ${id.voice}`);
    if (id.banned) lines.push(`Banned items (never include): ${id.banned}`);
  }
  parts.push(lines.join("\n"));
  const rules = ctx.houseRules.filter((r) => r.enabled).sort((a, b) => a.sort - b.sort);
  if (rules.length) {
    parts.push(`HOUSE RULES (always follow):\n${rules.map((r) => `- ${r.text}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

/* ---------- Step 2: scripts ---------- */

export interface ScriptRequest {
  idea: string;
  count: number;
  clipCount: number | null;
  targetModel: string;
  /** Exact length written onto every clip. */
  clipSeconds: number;
  language: string;
  pillar: string | null;
  aspectRatio: string;
  steerNote?: string;
  /** When regenerating one script: the one being replaced. */
  previous?: { title: string; hook: string; clips: { dialogue: string; action: string; duration_s: number }[] };
}

type ModelLimits = { clipSeconds: number; maxClipSeconds: number };

function limitsFor(targetModel: string): ModelLimits {
  const known = (TARGET_MODELS as Record<string, ModelLimits>)[targetModel];
  return known ?? { clipSeconds: 10, maxClipSeconds: 10 };
}

/** Default seconds per clip for a model. Veo is 10. */
export function clipSecondsFor(targetModel: string): number {
  return limitsFor(targetModel).clipSeconds;
}

/** Hard cap for a model. Veo cannot exceed 10. */
export function maxClipSecondsFor(targetModel: string): number {
  return limitsFor(targetModel).maxClipSeconds;
}

/** Chosen length, kept inside 2..model max. Missing values fall back to the model default (10 for Veo). */
export function resolveClipSeconds(targetModel: string, chosen: number | null | undefined): number {
  const { clipSeconds, maxClipSeconds } = limitsFor(targetModel);
  const n = chosen ?? clipSeconds;
  if (!Number.isFinite(n)) return clipSeconds;
  return Math.min(Math.max(Math.round(n), 2), maxClipSeconds);
}

export function scriptUserPrompt(r: ScriptRequest): string {
  const secs = r.clipSeconds;
  const lang = (LANGUAGES as readonly string[]).includes(r.language) ? r.language : "Taglish";
  const lines = [
    `Idea: ${r.idea}`,
    `Write ${r.count} script option${r.count > 1 ? "s" : ""}.`,
    `Language: ${lang}.`,
    `Target video model: ${r.targetModel} (each clip is exactly ${secs} seconds; set duration_s to ${secs}).`,
    r.clipCount ? `Number of clips per script: exactly ${r.clipCount}.` : "Number of clips per script: auto (fewest that fit).",
    r.pillar ? `Content pillar: ${r.pillar}.` : "",
    `Aspect ratio: ${r.aspectRatio}.`,
  ];
  if (r.previous) {
    lines.push(
      "",
      "You are REPLACING this script. Do not repeat it:",
      JSON.stringify(r.previous),
    );
  }
  if (r.steerNote) lines.push("", `Steer: ${r.steerNote}`);
  return lines.filter((l) => l !== "").join("\n");
}

export function scriptClipUserPrompt(args: {
  idea: string;
  language: string;
  title: string;
  hook: string;
  clips: { dialogue: string; action: string; duration_s: number }[];
  clipIndex: number;
  steerNote?: string;
}): string {
  const clip = args.clips[args.clipIndex];
  if (!clip) throw new Error("Clip not found");
  const lang = (LANGUAGES as readonly string[]).includes(args.language) ? args.language : "Taglish";
  const pace = wordsPerSecond(lang);
  const maxWords = Math.floor(clip.duration_s * pace);
  const lines = [
    `Idea: ${args.idea}`,
    `Language: ${lang}.`,
    `Script title: ${args.title}`,
    `Hook: ${args.hook}`,
    "Full script. Rewrite ONLY the marked clip. Leave title, hook, clip count, durations, and every other clip exactly as written:",
    JSON.stringify({
      title: args.title,
      hook: args.hook,
      clips: args.clips.map((c, i) => ({
        clip: i + 1,
        dialogue: c.dialogue,
        action: c.action,
        duration_s: c.duration_s,
        rewrite: i === args.clipIndex,
      })),
    }),
    "",
    `Rewrite clip ${args.clipIndex + 1} only.`,
    `It is ${clip.duration_s} seconds. Spoken words must fit at about ${pace} words per second, so about ${maxWords} words.`,
    "Return only the new dialogue and action for that clip.",
  ];
  if (args.steerNote?.trim()) lines.push("", `Steer: ${args.steerNote.trim()}`);
  return lines.join("\n");
}

/* ---------- Step 3: stills ---------- */

export interface StillClipInput {
  idx: number;
  dialogue: string;
  action: string;
  durationS: number;
  location: Preset | null;
  wardrobe: Preset | null;
}

export function stillBatchUserPrompt(args: {
  scriptTitle: string;
  aspectRatio: string;
  clips: StillClipInput[];
  steerNote?: string;
}): string {
  const clipLines = args.clips.map((c) =>
    [
      `Clip ${c.idx}:`,
      `  dialogue: ${c.dialogue || "(none)"}`,
      `  action: ${c.action || "(none)"}`,
      `  duration: ${c.durationS}s`,
      `  location preset: ${c.location ? `${c.location.name} -> ${c.location.body}` : "(none, infer from script)"}`,
      `  wardrobe preset: ${c.wardrobe ? `${c.wardrobe.name} -> ${c.wardrobe.body}` : "(none, use wardrobe DNA)"}`,
    ].join("\n"),
  );
  return [
    `Script: ${args.scriptTitle}`,
    `Aspect ratio: ${args.aspectRatio}`,
    `Write the first-frame still prompt for EACH clip below. Return one entry per clip with its idx.`,
    ...clipLines,
    args.steerNote ? `Steer: ${args.steerNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function stillSingleUserPrompt(args: {
  scriptTitle: string;
  aspectRatio: string;
  clip: StillClipInput;
  previousPrompt?: string;
  neighbors: { idx: number; camera: string }[];
  steerNote?: string;
}): string {
  const base = stillBatchUserPrompt({
    scriptTitle: args.scriptTitle,
    aspectRatio: args.aspectRatio,
    clips: [args.clip],
  });
  const lines = [base];
  if (args.neighbors.length) {
    lines.push(
      `Neighbor clips use these cameras (do not repeat the adjacent one): ${args.neighbors
        .map((n) => `clip ${n.idx}: ${n.camera}`)
        .join("; ")}`,
    );
  }
  if (args.previousPrompt) lines.push(`Current version being replaced:\n${args.previousPrompt}`);
  if (args.steerNote) lines.push(`Steer: ${args.steerNote}`);
  return lines.join("\n");
}

/** Deterministic render of a still prompt. Identity lock is always prepended to Subject. */
export function renderStill(identity: IdentityPack | null, p: StillPrompt): string {
  const lock = identity?.appearance_lock?.trim();
  const subject = [lock, p.subject.trim()].filter(Boolean).join(" ");
  const lines = [
    `Subject: ${subject}`,
    `Pose: ${p.pose.trim()}`,
    `Wardrobe: ${p.wardrobe.trim()}`,
    `Setting: ${p.setting.trim()}`,
    `Style: ${p.style.trim()}`,
    `Color: ${p.color.trim()}`,
    `Lighting: ${p.lighting.trim()}`,
    `Camera: ${p.camera.trim()}`,
    `Aspect ratio: ${p.aspect_ratio.trim()}`,
  ];
  if (p.visible_text.trim()) lines.push(`Visible text: ${p.visible_text.trim()}`);
  return lines.join("\n");
}

/* ---------- Step 4: video ---------- */

export function videoUserPrompt(args: {
  dialogue: string;
  action: string;
  durationS: number;
  targetModel: string;
  aspectRatio: string;
  stillPrompt?: string;
  steerNote?: string;
  previousPrompt?: string;
}): string {
  return [
    "Look at the attached still. Write the motion-only video prompt for this clip.",
    `Duration: ${args.durationS} seconds. Target model: ${args.targetModel}. Aspect ratio: ${args.aspectRatio}.`,
    `Dialogue (verbatim, must be spoken in order): ${args.dialogue || "(none, silent clip)"}`,
    `Action / beat: ${args.action || "(none)"}`,
    args.stillPrompt ? `The still was generated from this prompt (do not repeat it):\n${args.stillPrompt}` : "",
    args.previousPrompt ? `Current version being replaced:\n${args.previousPrompt}` : "",
    args.steerNote ? `Steer: ${args.steerNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fmtSec(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function renderVideo(args: {
  video: VideoPrompt;
  dialogue: string;
  durationS: number;
}): string {
  const { video: v } = args;
  const seq = v.beats
    .map(
      (b) =>
        `${fmtSec(b.start_s)}\u2013${fmtSec(b.end_s)}s | Camera: ${b.camera.trim()} | Character: ${b.character.trim()} | Dialogue: ${b.dialogue.trim() ? `"${b.dialogue.trim()}"` : "(none)"} | Scene: ${b.scene.trim()}`,
    )
    .join("\n");
  return [
    `Camera: ${v.camera.trim()} One continuous take; no flicker. Duration ${args.durationS} seconds.`,
    "",
    `Look: ${v.look.trim()}`,
    "",
    `Style: ${v.style.trim()}`,
    "",
    `Subject: Preserve face and wardrobe from the still. ${v.subject_motion.trim()}`,
    "",
    `Atmosphere: ${v.atmosphere.trim()}`,
    "",
    `Sound flow: ${v.sound_flow.trim()}`,
    "",
    "SCENE SEQUENCE \u2014 second by second:",
    seq,
    "",
    "Dialogue (full):",
    args.dialogue.trim() ? `"${args.dialogue.trim()}"` : "(none)",
  ].join("\n");
}

/* ---------- Finish: captions ---------- */

export function captionUserPrompt(args: {
  title: string;
  idea: string;
  language: string;
  pillar: string | null;
  clips: { dialogue: string }[];
  steerNote?: string;
}): string {
  return [
    `Video: ${args.title}`,
    `Idea: ${args.idea}`,
    `Language: ${args.language}`,
    args.pillar ? `Pillar: ${args.pillar}` : "",
    `Full script:\n${args.clips.map((c, i) => `${i + 1}. ${c.dialogue}`).join("\n")}`,
    args.steerNote ? `Steer: ${args.steerNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
