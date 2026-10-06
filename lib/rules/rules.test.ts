import { describe, expect, it } from "vitest";
import type { IdentityPack } from "@/lib/supabase/types";
import { checkDialogueFits, checkStillPrompt, checkVideoPrompt, parseLabeledLines } from "./index";

const identity: IdentityPack = {
  id: "1",
  workspace_id: "w",
  appearance_lock: "Lolo Isko, an elderly Filipino man of about 72, warm brown weathered skin, short white hair",
  wardrobe_dna: "Off-white camisa de chino",
  palette: "",
  voice: "",
  banned: "monk robes, watermark, text",
  pillars: [],
  face_ref_urls: [],
  character_sheet_url: null,
};

const goodStill = `Subject: Lolo Isko, calm expression.
Pose: Seated on the papag.
Wardrobe: Off-white camisa de chino.
Setting: Yard with banana leaves. No watermark.
Style: Photoreal.
Color: Warm earth tones.
Lighting: Golden hour.
Camera: Medium close-up, eye level.
Aspect ratio: 9:16`;

describe("checkStillPrompt", () => {
  it("accepts a well-formed prompt", () => {
    expect(checkStillPrompt(goodStill, { identity })).toEqual([]);
  });

  it("flags missing and out-of-order labels", () => {
    const swapped = goodStill.replace("Pose: Seated on the papag.\nWardrobe: Off-white camisa de chino.", "Wardrobe: Off-white camisa de chino.\nPose: Seated on the papag.");
    const w = checkStillPrompt(swapped, { identity });
    expect(w.some((x) => x.rule === "still.order")).toBe(true);
    const missing = goodStill.replace(/Lighting:.*\n/, "");
    expect(checkStillPrompt(missing, { identity }).some((x) => x.message.includes("Lighting"))).toBe(true);
  });

  it("flags Visible text when empty or none", () => {
    const w = checkStillPrompt(`${goodStill}\nVisible text: none`, { identity });
    expect(w.some((x) => x.rule === "still.visible-text")).toBe(true);
    expect(checkStillPrompt(`${goodStill}\nVisible text: "PAHINGA"`, { identity })).toEqual([]);
  });

  it("flags selfie shots without hidden palm/wrist", () => {
    const selfie = goodStill.replace("Camera: Medium close-up, eye level.", "Camera: Handheld selfie, arm toward lens.");
    const w = checkStillPrompt(selfie, { identity });
    expect(w.some((x) => x.rule === "still.selfie-hand")).toBe(true);
    const ok = goodStill.replace(
      "Camera: Medium close-up, eye level.",
      "Camera: Handheld selfie, forearm only after the wrist, palm not visible, phone not visible.",
    );
    expect(checkStillPrompt(ok, { identity })).toEqual([]);
  });

  it("flags banned items but ignores negated ones", () => {
    const bad = goodStill.replace("Wardrobe: Off-white camisa de chino.", "Wardrobe: Off-white camisa de chino and monk robes.");
    expect(checkStillPrompt(bad, { identity }).some((x) => x.rule === "still.banned")).toBe(true);
  });
});

describe("checkVideoPrompt", () => {
  const dialogue = "Anak, pagod ka na ba?";
  const good = `Camera: Slow Push In. Eye Level.
Subject: Preserve face and wardrobe from the still. Soft nod, open hand gesture on "pagod".
SCENE SEQUENCE:
0\u20134s | Camera: push | Character: hand opens | Dialogue: "Anak, pagod ka na ba?" | Scene: yard
Dialogue (full):
"Anak, pagod ka na ba?"`;

  it("accepts motion-only prompt", () => {
    expect(checkVideoPrompt(good, { identity, dialogue, durationS: 8 })).toEqual([]);
  });

  it("flags appearance re-description", () => {
    const bad = good.replace("Soft nod", "He is wearing an off-white camisa. Soft nod");
    expect(checkVideoPrompt(bad, { identity, dialogue, durationS: 8 }).some((x) => x.rule === "video.motion-only")).toBe(true);
  });

  it("flags missing gestures and long sequences", () => {
    const noGesture = "Camera: Static.\n0\u20138s | Dialogue: \"Anak, pagod ka na ba?\"";
    expect(checkVideoPrompt(noGesture, { identity, dialogue, durationS: 8 }).some((x) => x.rule === "video.gestures")).toBe(true);
    const long = good.replace("0\u20134s", "0\u201312s");
    expect(checkVideoPrompt(long, { identity, dialogue, durationS: 8 }).some((x) => x.rule === "video.duration")).toBe(true);
  });
});

describe("checkDialogueFits", () => {
  it("passes short lines and flags long ones", () => {
    expect(checkDialogueFits("Anak, pagod ka na ba?", 8, "Taglish")).toEqual([]);
    const long = Array.from({ length: 40 }, () => "salita").join(" ");
    expect(checkDialogueFits(long, 8, "Taglish")[0]?.severity).toBe("error");
  });
});

describe("parseLabeledLines", () => {
  it("parses known labels only", () => {
    expect(parseLabeledLines("Subject: a\nRandom: b\nAspect ratio: 9:16").map((l) => l.label)).toEqual(["Subject", "Aspect ratio"]);
  });
});
