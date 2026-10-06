import { z } from "zod";

/* ---------- Step 1: idea options ---------- */

export const TARGET_MODELS = {
  veo: { label: "Veo (Flow)", clipSeconds: 10, maxClipSeconds: 10 },
  seedance: { label: "Seedance", clipSeconds: 15, maxClipSeconds: 15 },
  kling: { label: "Kling", clipSeconds: 15, maxClipSeconds: 15 },
} as const;
export type TargetModel = keyof typeof TARGET_MODELS;

const MIN_CLIP_SECONDS = 2;

export const LANGUAGES = ["Taglish", "English", "Tagalog"] as const;
export type Language = (typeof LANGUAGES)[number];

export const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5"] as const;

export const IdeaInput = z
  .object({
    workspaceId: z.string().uuid(),
    idea: z.string().trim().min(3, "Write at least a few words"),
    title: z.string().trim().optional(),
    targetModel: z.enum(["veo", "seedance", "kling"]),
    clipCount: z.number().int().min(1).max(10).nullable(),
    clipSeconds: z.number().int().min(MIN_CLIP_SECONDS),
    language: z.enum(LANGUAGES),
    pillar: z.string().trim().nullable(),
    aspectRatio: z.enum(ASPECT_RATIOS),
    scriptCount: z.number().int().min(1).max(5),
  })
  .superRefine((val, ctx) => {
    const max = TARGET_MODELS[val.targetModel].maxClipSeconds;
    if (val.clipSeconds > max) {
      ctx.addIssue({
        code: "custom",
        path: ["clipSeconds"],
        message: `${TARGET_MODELS[val.targetModel].label} clips are at most ${max} seconds`,
      });
    }
  });
export type IdeaInput = z.infer<typeof IdeaInput>;

/* ---------- Step 2: scripts ---------- */

export const ScriptClipSchema = z.object({
  dialogue: z.string().describe("Exactly what the character says in this clip"),
  action: z.string().describe("What happens visually in this clip (beat / action / expression)"),
  duration_s: z.number().int().min(2).max(30).describe("Clip duration in seconds"),
});

export const ScriptOptionSchema = z.object({
  title: z.string(),
  hook: z.string().describe("The first line / scroll-stopping hook"),
  clips: z.array(ScriptClipSchema).min(1).max(10),
});

export const ScriptOptions = z.object({
  options: z.array(ScriptOptionSchema).min(1).max(5),
});
export type ScriptOptions = z.infer<typeof ScriptOptions>;
export type ScriptOption = z.infer<typeof ScriptOptionSchema>;

/** One clip rewritten in place. Duration stays on the existing clip. */
export const ScriptClipRewrite = z.object({
  dialogue: z.string().describe("Exactly what the character says in this clip"),
  action: z.string().describe("What happens visually in this clip (beat / action / expression)"),
});
export type ScriptClipRewrite = z.infer<typeof ScriptClipRewrite>;

/* ---------- Step 3: still prompts (AI realism format) ---------- */

export const STILL_LABELS = [
  "Subject",
  "Pose",
  "Wardrobe",
  "Setting",
  "Style",
  "Color",
  "Lighting",
  "Camera",
  "Aspect ratio",
  "Visible text",
] as const;

export const StillPrompt = z.object({
  subject: z
    .string()
    .describe(
      "Expression and what the character is doing. Do NOT describe face/age/hair: the identity lock is prepended automatically.",
    ),
  pose: z.string(),
  wardrobe: z.string(),
  setting: z.string(),
  style: z.string(),
  color: z.string(),
  lighting: z.string(),
  camera: z.string().describe("Shot size, angle, lens feel"),
  aspect_ratio: z.string(),
  visible_text: z
    .string()
    .describe("Only text that must appear in the image. Empty string when there is no text."),
});
export type StillPrompt = z.infer<typeof StillPrompt>;

export const StillBatch = z.object({
  clips: z
    .array(z.object({ idx: z.number().int().min(0), prompt: StillPrompt }))
    .min(1)
    .max(10),
});
export type StillBatch = z.infer<typeof StillBatch>;

/* ---------- Step 4: video prompt (motion only) ---------- */

export const VideoBeat = z.object({
  start_s: z.number().min(0),
  end_s: z.number().min(0.5),
  camera: z.string().describe("Camera move + angle + framing for this beat"),
  character: z.string().describe("Body motion and free-hand speaking gesture timed to the words. No appearance description."),
  dialogue: z.string().describe("The words spoken during this beat (verbatim slice of the clip dialogue)"),
  scene: z.string().describe("Only what is already in the still, plus any motion in the environment"),
});

export const VideoPrompt = z.object({
  camera: z.string().describe("Primary move + angle. One continuous take."),
  look: z.string().describe("Short phone-video realism note"),
  style: z.string().describe("Short vibe note"),
  subject_motion: z.string().describe("Micro-motion and speaking gestures only. Never re-describe the face or outfit."),
  atmosphere: z.string(),
  sound_flow: z.string().describe("Voice character, ambient sound, music policy"),
  beats: z.array(VideoBeat).min(1).max(8),
});
export type VideoPrompt = z.infer<typeof VideoPrompt>;

/* ---------- Finish: caption pack ---------- */

export const CaptionPack = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).max(4).describe("At most 4 niche hashtags, each starting with #"),
  on_screen_text: z.string(),
});
export type CaptionPack = z.infer<typeof CaptionPack>;

/* ---------- Phase 4: trend -> script ---------- */

export const TrendBreakdown = z.object({
  summary: z.string(),
  hook: z.string(),
  beats: z.array(
    z.object({
      time: z.string(),
      what_happens: z.string(),
      why_it_works: z.string(),
    }),
  ),
  camera_notes: z.string(),
  audio_notes: z.string(),
});
export type TrendBreakdown = z.infer<typeof TrendBreakdown>;
