import type { TrendBreakdown } from "@/lib/schemas";

export const TREND_SYSTEM = `You are a short-form video analyst. You are given evenly spaced frames from a trending vertical video (in order, first to last), plus optional caption text and notes from the creator.
Break the video down so another creator can recreate its STRUCTURE and RHYTHM with a different character. Be concrete and observational:
- summary: one sentence on what the video is.
- hook: what happens in the first second or two that stops the scroll.
- beats: time ranges (estimate from frame order) with what happens and why it works.
- camera_notes: framing, angles, movement, cuts.
- audio_notes: what the audio probably does (voice, sound, music), only if you can infer it from the caption or frames; otherwise say it cannot be seen.
Only describe what is visible or stated. Do not invent dialogue you cannot see. Do not identify real people.`;

export function trendUserPrompt(args: { frameCount: number; caption?: string; author?: string; notes?: string }): string {
  return [
    `There are ${args.frameCount} frames, in chronological order.`,
    args.caption ? `Original caption: ${args.caption}` : "",
    args.author ? `Creator: ${args.author}` : "",
    args.notes ? `Notes from the user: ${args.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Turn a breakdown into the idea text that feeds the normal script generator. */
export function ideaFromBreakdown(b: TrendBreakdown, opts: { sourceUrl?: string; notes?: string }): string {
  return [
    "Recreate this trending video's structure in this character's own voice, setting and pillars. Do not copy any lines.",
    opts.sourceUrl ? `Source: ${opts.sourceUrl}` : "",
    `What it is: ${b.summary}`,
    `Hook: ${b.hook}`,
    "Beats:",
    ...b.beats.map((x) => `- ${x.time}: ${x.what_happens} (${x.why_it_works})`),
    `Camera: ${b.camera_notes}`,
    `Audio: ${b.audio_notes}`,
    opts.notes ? `Extra direction: ${opts.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
