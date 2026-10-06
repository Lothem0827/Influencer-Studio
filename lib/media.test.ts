import { describe, expect, it } from "vitest";
import { formatBytes, inferMime, pickMatchingFile, validateUpload } from "./media";

describe("validateUpload", () => {
  it("rejects empty files", () => {
    expect(validateUpload("image", { type: "image/png", name: "a.png", size: 0 }).ok).toBe(false);
  });

  it("rejects oversized files with a readable limit", () => {
    const res = validateUpload("image", { type: "image/png", name: "a.png", size: 21 * 1024 * 1024 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/20 MB/);
  });

  it("guesses mime from the filename when type is missing", () => {
    const res = validateUpload("image", { type: "", name: "still.webp", size: 12 });
    expect(res).toEqual({ ok: true, mime: "image/webp" });
  });

  it("strips codec parameters from mime types", () => {
    expect(inferMime("video", { type: "video/mp4; codecs=avc1", name: "clip.mp4" })).toBe("video/mp4");
    expect(validateUpload("video", { type: "video/mp4; codecs=avc1", name: "clip.mp4", size: 10 }).ok).toBe(true);
  });

  it("rejects a video dropped on an image slot", () => {
    const res = validateUpload("image", { type: "video/mp4", name: "clip.mp4", size: 10 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/image/);
  });
});

describe("pickMatchingFile", () => {
  it("skips the wrong type and uses the first valid file", () => {
    const files = [
      new File(["nope"], "notes.txt", { type: "text/plain" }),
      new File(["ok"], "still.png", { type: "image/png" }),
    ];
    const picked = pickMatchingFile("image", files);
    expect(picked?.name).toBe("still.png");
  });
});

describe("formatBytes", () => {
  it("rounds to MB for large files", () => {
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });
});
