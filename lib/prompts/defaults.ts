// Seed content. Pure data (no server-only imports) so scripts/seed can use it.
// Prompt text lives here, not in components.

import type { TemplateStep } from "@/lib/supabase/types";

export const GLOBAL_HOUSE_RULES: string[] = [
  "Handheld selfie: the camera-holding hand's palm and wrist must NOT be visible. Frame so only after the wrist (forearm toward the elbow) can appear. The phone is not visible.",
  "Talking clips: always write natural speaker-style free-hand gestures timed to the dialogue. Never frozen arms. If one hand holds the camera, the OTHER hand moves with the words.",
  "The next clip in a pack keeps the same environment, wardrobe and light as the previous clip unless the script changes it. Only the camera angle and shot size change.",
];

export interface TemplateSeed {
  /** null = global */
  workspaceSlug: string | null;
  step: TemplateStep;
  name: string;
  isDefault: boolean;
  systemPrompt: string;
}

const SCRIPT_BASE = `You are a short-form video scriptwriter for a disclosed AI influencer (TikTok / Reels).
You write scripts that are split into clips. Each clip is ONE continuous take with ONE idea.

Rules:
- Clip 1 carries the hook. Make it scroll-stopping and specific, never generic.
- One idea per clip. At most ONE call to action in the whole script, normally in the last clip.
- Respect the clip duration given in the brief. Spoken words per clip must fit: about 2.2 words per second for Tagalog/Taglish, 2.5 for English, at an unhurried pace.
- "dialogue" is only what is said out loud. "action" is the visual beat, expression and body language (no camera moves here).
- Never invent facts, statistics, credentials or fake biography. No medical diagnosis or cure claims.
- When asked for several options, make them genuinely different in angle and tone, not rewordings.
- Write in the requested language. Taglish means natural Tagalog-English code switching (roughly 80% Tagalog, 20% English).
- Keep the clip count at the requested number; if "auto", use the smallest number of clips that fits the idea.`;

const STILL_BASE = `You write first-frame still-image prompts for an AI image model, in the "AI realism" format.
You return structured fields; the app renders them as plain labeled lines in this exact order:
Subject, Pose, Wardrobe, Setting, Style, Color, Lighting, Camera, Aspect ratio, Visible text (only if text exists).

Rules:
- Subject: expression and what the character is doing ONLY. The identity lock is prepended automatically, so never describe face, age, hair or skin.
- Wardrobe: use the wardrobe preset verbatim when one is provided, otherwise the wardrobe DNA. Never include banned items.
- Setting: use the location preset verbatim when one is provided. Keep the same environment across clips in a pack unless the script changes it.
- Style: photoreal, natural phone/camera realism, subtle film grain. No illustration looks.
- Camera: shot size + angle + lens feel. Change the angle between consecutive clips (never the same angle twice in a row) but keep the horizon level.
- Talking clips: frame 1 is a closed mouth, about to speak, with a clear expression.
- Handheld selfie shots: follow the house rules about the holding hand (no palm or wrist visible, phone not visible).
- Visible text: empty string unless the script explicitly needs readable text in the image. No watermarks, no subtitles.
- Plain, concrete, comma-light language. No poetry, no stacked adjectives.`;

const VIDEO_BASE = `You write motion-only image-to-video prompts (Google Flow / Veo style) from a still image plus the clip's script line.
The still already defines the face, outfit, setting and light. Never re-describe appearance or clothing; say "preserve face and wardrobe from the still" when needed.

Return structured fields:
- camera: ONE primary move + angle (for example "Slow Push In, Eye Level, Front"). One continuous take, no flicker, no cuts.
- look / style: short phone-video realism notes.
- subject_motion: micro-motion and speaking gestures only (blinks, nods, breathing, head tilts, free-hand gestures timed to words).
- atmosphere: mood and light as already seen in the still.
- sound_flow: voice character, ambient sound, and music policy.
- beats: second-by-second SCENE SEQUENCE across the whole clip duration (no gaps, last beat ends at the duration). The dialogue across beats must be the clip dialogue, verbatim and in order, never reworded.

House gestures: whenever there is dialogue, every beat that has words includes a speaker-style free-hand gesture. Never frozen arms.
Handheld selfie = UGC phone-cam: only the character operates the camera, phone not visible, holding palm and wrist out of frame. If the still is not selfie-angled, convert it to a selfie phone-hold.
Never invent script, extras or props that are not in the still.`;

const CAPTION_BASE = `You write the posting pack for a short-form AI-influencer video: a caption, at most 4 niche hashtags (each starting with #), and a short on-screen text line (a hook, max 8 words).
Match the character's voice. Do not use more than one emoji. No medical or income claims. Do not invent facts that are not in the script.`;

const LOLO_SCRIPT = `${SCRIPT_BASE}

LOLO ISKO PACK RULES (override anything above that conflicts):
- Taglish, 80% Tagalog / 20% English. Vocatives: "Anak", "Apo". Warm, unhurried, lambing. One CTA only.
- Pace: warm unhurried, about 2.2 words per second. Pack the script into as FEW clips as will fit; do not over-split a short comfort line.
- Beats: clip 1 = hook / burden, last clip = lesson / hope / CTA.
- CTA by day type: Save, comment PAHINGA, or a community question. No shop, #Ad or product during the launch period.
- Never diagnose, never say something is "gamot", never invent a biography, never refer to a real celebrity or neighbor.
- No on-screen text, no subtitles. Voice only.`;

const LOLO_STILL = `${STILL_BASE}

LOLO ISKO PACK RULES (override anything above that conflicts):
- Camera is a static tripod. The image is frame 1 of a talking clip: closed mouth, about to speak, direct eye contact with the lens.
- Same set, same clothes, same light for the whole pack. Golden-hour light, slight film grain, photoreal 9:16.
- Cycle angles so consecutive clips differ: medium close-up chest-up front eye-level; medium waist-up 3/4 from camera-left; medium close-up chest-up 3/4 from camera-right; full body front; medium knees-up 3/4. Horizon stays level (no Dutch tilt).
- No text, no subtitles, no watermark. Visible text stays empty.`;

const DRAMA_SCRIPT = `${SCRIPT_BASE}

DRAMA SERIES RULES:
- This is an episode in an ongoing short drama. Each clip is a scene beat with a clear want, an obstacle and a turn.
- Clip 1 opens mid-conflict. The last clip ends on a cliffhanger line or visual, never a resolution.
- Dialogue is short, spoken, subtext-heavy. Max two speakers per clip; name the speaker in "action", not in "dialogue".`;

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  { workspaceSlug: null, step: "script", name: "Script options (default)", isDefault: true, systemPrompt: SCRIPT_BASE },
  { workspaceSlug: null, step: "still", name: "AI realism still", isDefault: true, systemPrompt: STILL_BASE },
  { workspaceSlug: null, step: "video", name: "I2V motion template", isDefault: true, systemPrompt: VIDEO_BASE },
  { workspaceSlug: null, step: "caption", name: "Caption pack", isDefault: true, systemPrompt: CAPTION_BASE },
  { workspaceSlug: null, step: "script", name: "Drama series", isDefault: false, systemPrompt: DRAMA_SCRIPT },
  { workspaceSlug: "lolo-isko", step: "script", name: "Lolo Isko pack script", isDefault: true, systemPrompt: LOLO_SCRIPT },
  { workspaceSlug: "lolo-isko", step: "still", name: "Lolo Isko pack still", isDefault: true, systemPrompt: LOLO_STILL },
];

/** Fallback when the DB has no template row for a step. */
export const FALLBACK_TEMPLATE: Record<TemplateStep, string> = {
  script: SCRIPT_BASE,
  still: STILL_BASE,
  video: VIDEO_BASE,
  caption: CAPTION_BASE,
};

export interface WorkspaceSeed {
  slug: string;
  name: string;
  nickname: string;
  niche: string;
  identity: {
    appearance_lock: string;
    wardrobe_dna: string;
    palette: string;
    voice: string;
    banned: string;
    pillars: { name: string; weight: number }[];
  };
  houseRules: string[];
  presets: { kind: "location" | "wardrobe"; name: string; body: string }[];
}

export const WORKSPACE_SEEDS: WorkspaceSeed[] = [
  {
    slug: "lolo-isko",
    name: "Lolo Isko",
    nickname: "Lolo",
    niche: "Comfort and everyday wisdom from a disclosed AI lolo (Taglish)",
    identity: {
      // Replace with your exact, word-for-word character lock in the Studio page.
      appearance_lock:
        "Lolo Isko, an elderly Filipino man of about 72, warm brown weathered skin, short white hair, gentle deep-set eyes with soft smile lines. Match the attached Lolo Isko character reference sheet exactly: face, skin, hair and age. No redesign, no stylization, no celebrity or neighbor likeness.",
      wardrobe_dna: "Off-white camisa de chino, same every clip.",
      palette: "Warm golden hour, soft earth tones, off-white, natural greens",
      voice:
        "Elderly Filipino man ~72, native Manila Tagalog speaker. Low warm baritone, dry, breathy, light rasp. Unhurried, close-mic. Filipino accent on every word including English. Not a cartoon lolo, not a radio DJ, not a priest.",
      banned:
        "monk robes, priest vestments, clinic, product labels, text, watermark, subtitles, celebrity likeness, neighbor likeness",
      pillars: [
        { name: "Ginhawa", weight: 70 },
        { name: "Kwento", weight: 20 },
        { name: "Community", weight: 10 },
      ],
    },
    houseRules: [
      "Lolo Isko clips use a static tripod camera: no zoom, pan, tilt, dolly, orbit, handheld, drift, fades or dissolves inside a clip. Change the camera angle and shot size between clips.",
      "Audio is voice plus diegetic environment only (birds, chickens, leaves, wood creak). No background music, no score. No subtitles, no captions, no on-screen text.",
    ],
    presets: [
      {
        kind: "location",
        name: "Outdoor papag yard",
        body: "Outdoor yard with a bamboo papag, banana leaves behind, a few chickens far in the background, warm golden-hour light.",
      },
      {
        kind: "location",
        name: "Afternoon kitchen",
        body: "Rustic Filipino kitchen with wooden table, clay pots and hanging herbs, soft afternoon window light.",
      },
      {
        kind: "wardrobe",
        name: "Camisa de chino",
        body: "Off-white camisa de chino, slightly worn cotton, top button open.",
      },
    ],
  },
  {
    slug: "iska",
    name: "Iska",
    nickname: "Iska",
    niche: "Campus life, study tips and relatable student moments (Taglish)",
    identity: {
      // Placeholder: edit in the Studio page to match your real character.
      appearance_lock:
        "Iska, a Filipina college student around 20, medium warm skin, shoulder-length dark hair, expressive dark eyes, natural makeup. Match the attached face reference exactly. No celebrity likeness.",
      wardrobe_dna: "Casual campus wear: oversized tee or hoodie, jeans, tote bag.",
      palette: "Maroon, forest green, cream, warm daylight",
      voice: "Young Filipina, bright and quick, natural Taglish, friendly and a little sarcastic.",
      banned: "school uniforms with real logos, brand logos, watermark, celebrity likeness",
      pillars: [
        { name: "Study tips", weight: 40 },
        { name: "Relatable", weight: 40 },
        { name: "Day in the life", weight: 20 },
      ],
    },
    houseRules: [],
    presets: [
      {
        kind: "location",
        name: "Dorm room",
        body: "Small dorm room with a bunk bed, desk lamp and sticky notes on the wall, soft warm lamp light.",
      },
      {
        kind: "location",
        name: "Campus walkway",
        body: "Tree-lined campus walkway with students blurred in the background, bright daylight.",
      },
      {
        kind: "wardrobe",
        name: "Oversized hoodie",
        body: "Oversized cream hoodie, light-wash jeans, canvas tote bag on one shoulder.",
      },
    ],
  },
];

export const DEMO_PROJECT = {
  workspaceSlug: "lolo-isko",
  title: "Demo: Pagod na si Anak",
  idea: "A comforting reminder for tired people that resting is not quitting.",
  targetModel: "veo",
  language: "Taglish",
  pillar: "Ginhawa",
  aspectRatio: "9:16",
  script: {
    title: "Pahinga ay hindi pagsuko",
    hook: "Anak, pagod ka na ba?",
    clips: [
      {
        dialogue: "Anak, pagod ka na ba? Hindi ka mahina. Tao ka lang.",
        action: "Lolo looks gently into the lens, a slow nod on 'Hindi ka mahina'. Open palm on 'Tao ka lang'.",
        duration_s: 10,
      },
      {
        dialogue: "Ang pahinga, hindi pagsuko. Save mo ito, para maalala mo.",
        action: "Soft almost-smile, one hand touches his chest, then offers an open palm toward the lens.",
        duration_s: 10,
      },
    ],
  },
} as const;
