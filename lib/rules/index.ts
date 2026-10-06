import type { CheckerWarning, IdentityPack } from "@/lib/supabase/types";

/** Pure shot-checker functions. No I/O, safe for client and server. */

export const STILL_REQUIRED_LABELS = [
  "Subject",
  "Pose",
  "Wardrobe",
  "Setting",
  "Style",
  "Color",
  "Lighting",
  "Camera",
  "Aspect ratio",
] as const;
export const STILL_OPTIONAL_LABELS = ["Visible text"] as const;
const ALL_STILL_LABELS = [...STILL_REQUIRED_LABELS, ...STILL_OPTIONAL_LABELS];

const warn = (rule: string, message: string, severity: "warn" | "error" = "warn"): CheckerWarning => ({
  rule,
  severity,
  message,
});

/** Parse "Label: value" lines. Returns labels in the order they appear. */
export function parseLabeledLines(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/);
    if (!m) continue;
    const known = ALL_STILL_LABELS.find((l) => l.toLowerCase() === m[1].toLowerCase());
    if (known) out.push({ label: known, value: m[2].trim() });
  }
  return out;
}

const SELFIE_RE = /\b(selfie|handheld|phone[- ]?cam|holding (the |a |his |her )?phone)\b/i;
const HAND_HIDDEN_RE =
  /(palm[^.\n]{0,60}(not visible|out of frame|hidden|cropped|no )|wrist[^.\n]{0,60}(not visible|out of frame|hidden|cropped|no )|after the wrist|only after (the )?wrist|no (visible )?palm|(not|never) (visible|in frame)[^.\n]{0,40}(palm|wrist))/i;
const PHONE_NOT_VISIBLE_RE = /phone[^.\n]{0,40}(not visible|out of frame|hidden|not shown|off[- ]camera)|(no|without) (visible )?phone/i;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function bannedTerms(identity: IdentityPack | null): string[] {
  if (!identity?.banned) return [];
  return identity.banned
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
}

/** True when the term appears in the text outside of a negation ("no watermark", "never X"). */
function mentionsOutsideNegation(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  const re = new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "giu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const start = m.index;
    // look back to the start of the sentence/line
    const before = lower.slice(0, start);
    const boundary = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("."));
    const sentence = before.slice(boundary + 1);
    if (!/\b(no|not|without|never|avoid|negative|ban(ned)?)\b/.test(sentence)) return true;
  }
  return false;
}

function selfieChecks(text: string, rulePrefix: string): CheckerWarning[] {
  if (!SELFIE_RE.test(text)) return [];
  const out: CheckerWarning[] = [];
  if (!HAND_HIDDEN_RE.test(text)) {
    out.push(
      warn(
        `${rulePrefix}.selfie-hand`,
        "Selfie/handheld shot: say the camera-holding palm and wrist are not visible (frame only after the wrist).",
      ),
    );
  }
  if (!PHONE_NOT_VISIBLE_RE.test(text)) {
    out.push(warn(`${rulePrefix}.selfie-phone`, "Selfie/handheld shot: state that the phone is not visible."));
  }
  return out;
}

/* ---------- Still prompt ---------- */

export interface StillCheckContext {
  identity: IdentityPack | null;
  /** Dialogue/action for the clip, to decide whether Visible text is legitimate. */
  scriptRequiresText?: boolean;
}

export function checkStillPrompt(text: string, ctx: StillCheckContext): CheckerWarning[] {
  const out: CheckerWarning[] = [];
  const lines = parseLabeledLines(text);
  const labels = lines.map((l) => l.label);

  // Required labels present
  for (const req of STILL_REQUIRED_LABELS) {
    if (!labels.includes(req)) out.push(warn("still.labels", `Missing label "${req}:"`, "error"));
  }
  // Exact order
  const expected = ALL_STILL_LABELS.filter((l) => labels.includes(l));
  if (labels.join("|") !== expected.join("|")) {
    out.push(warn("still.order", `Labels out of order. Expected: ${ALL_STILL_LABELS.join(", ")}.`, "error"));
  }
  if (new Set(labels).size !== labels.length) {
    out.push(warn("still.labels", "A label appears more than once.", "error"));
  }
  // Visible text only if text exists
  const vt = lines.find((l) => l.label === "Visible text");
  if (vt) {
    const empty = !vt.value || /^(none|n\/a|no text|no|-+)$/i.test(vt.value);
    if (empty) out.push(warn("still.visible-text", 'Remove "Visible text:" when there is no text in the image.'));
  } else if (ctx.scriptRequiresText) {
    out.push(warn("still.visible-text", 'The script needs readable text: add "Visible text:".'));
  }

  out.push(...selfieChecks(text, "still"));

  // Wardrobe / banned items (scan everything except label names)
  const body = lines.map((l) => l.value).join("\n");
  const banned = bannedTerms(ctx.identity);
  const hits = banned.filter((b) => mentionsOutsideNegation(body, b));
  if (hits.length) out.push(warn("still.banned", `Banned item(s) mentioned: ${hits.join(", ")}.`));

  // Wardrobe DNA mismatch (soft): at least one wardrobe keyword
  const wardrobe = lines.find((l) => l.label === "Wardrobe")?.value ?? "";
  const dna = ctx.identity?.wardrobe_dna ?? "";
  if (wardrobe && dna) {
    const dnaWords = normalize(dna)
      .split(" ")
      .filter((w) => w.length > 3);
    const wardrobeNorm = normalize(wardrobe);
    if (dnaWords.length && !dnaWords.some((w) => wardrobeNorm.includes(w))) {
      out.push(warn("still.wardrobe-dna", "Wardrobe does not seem to match the wardrobe DNA from the identity pack."));
    }
  }

  return out;
}

/* ---------- Video prompt ---------- */

export interface VideoCheckContext {
  identity: IdentityPack | null;
  dialogue: string;
  durationS: number;
}

const APPEARANCE_RE =
  /\b(wearing|dressed in|years? old|year-old|aged \d+|\d+-year|skin tone|hair is|has (short|long|white|black|brown) hair|eyes are|camisa|hoodie|t-?shirt|jeans)\b/i;

function hasOverlappingWindow(text: string, source: string, size: number): boolean {
  const src = normalize(source).split(" ").filter(Boolean);
  const hay = ` ${normalize(text)} `;
  for (let i = 0; i + size <= src.length; i++) {
    const win = src.slice(i, i + size).join(" ");
    if (hay.includes(` ${win} `)) return true;
  }
  return false;
}

export function checkVideoPrompt(text: string, ctx: VideoCheckContext): CheckerWarning[] {
  const out: CheckerWarning[] = [];

  // Motion-only: do not re-describe face/outfit. Ignore the sentence "Preserve face and wardrobe".
  const stripped = text.replace(/preserve face and wardrobe[^.\n]*\.?/gi, "");
  const m = stripped.match(APPEARANCE_RE);
  if (m) out.push(warn("video.motion-only", `Video prompt re-describes appearance ("${m[0]}"). Keep it motion-only.`));
  const id = ctx.identity;
  if (id && ((id.appearance_lock && hasOverlappingWindow(stripped, id.appearance_lock, 5)) || (id.wardrobe_dna && hasOverlappingWindow(stripped, id.wardrobe_dna, 4)))) {
    out.push(warn("video.motion-only", "Video prompt repeats the identity lock / wardrobe text. The still already carries it."));
  }

  // Talking clip needs gestures
  if (ctx.dialogue.trim()) {
    if (!/\b(gestur|hand|palm|finger|arm)/i.test(text)) {
      out.push(warn("video.gestures", "Talking clip has no speaking hand gestures. Add free-hand gestures timed to the words."));
    }
    if (!hasOverlappingWindow(text, ctx.dialogue, Math.min(4, Math.max(1, normalize(ctx.dialogue).split(" ").length)))) {
      out.push(warn("video.dialogue", "The clip dialogue does not appear verbatim in the prompt."));
    }
  }

  out.push(...selfieChecks(text, "video"));

  // Scene sequence must fit the duration
  const ends = [...text.matchAll(/(\d+(?:\.\d+)?)\s*[\u2013-]\s*(\d+(?:\.\d+)?)s/g)].map((x) => Number(x[2]));
  if (ends.length) {
    const max = Math.max(...ends);
    if (max > ctx.durationS + 0.5) {
      out.push(warn("video.duration", `Scene sequence runs to ${max}s but the clip is ${ctx.durationS}s.`, "error"));
    }
  }
  return out;
}

/* ---------- Dialogue length ---------- */

export function wordsPerSecond(language: string): number {
  return /english/i.test(language) ? 2.5 : 2.2;
}

export function checkDialogueFits(dialogue: string, durationS: number, language: string): CheckerWarning[] {
  const words = dialogue.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return [];
  const capacity = durationS * wordsPerSecond(language);
  if (words > capacity * 1.3) {
    return [warn("dialogue.length", `${words} words will not fit in ${durationS}s (about ${Math.floor(capacity)} max). Trim it.`, "error")];
  }
  if (words > capacity * 1.05) {
    return [warn("dialogue.length", `${words} words is tight for ${durationS}s (about ${Math.floor(capacity)} fit comfortably).`)];
  }
  return [];
}
