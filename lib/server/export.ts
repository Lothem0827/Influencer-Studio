import "server-only";
import JSZip from "jszip";
import { db } from "@/lib/server/supabase";
import { bucketFor, getAssets, getClips, getProject, getPrompts, getScripts } from "@/lib/server/data";
import type { Asset } from "@/lib/supabase/types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function extOf(path: string, fallback: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : fallback;
}

export function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}

export async function buildProjectZip(projectId: string): Promise<{ buffer: Buffer; name: string }> {
  const project = await getProject(projectId);
  const clips = await getClips(projectId, project.picked_script_id);
  const ids = clips.map((c) => c.id);
  const [prompts, assets, scripts, caption] = await Promise.all([
    getPrompts(ids),
    getAssets(ids),
    getScripts(projectId),
    db().from("captions").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  const script = scripts.find((s) => s.id === project.picked_script_id);

  const zip = new JSZip();

  // script.txt
  const scriptLines = [
    `${project.title}`,
    script ? `Script: ${script.title}` : "",
    script ? `Hook: ${script.hook}` : "",
    "",
    ...clips.flatMap((c) => [
      `Clip ${c.idx + 1} (${c.duration_s}s)`,
      `Dialogue: ${c.dialogue}`,
      `Action: ${c.action}`,
      "",
    ]),
  ];
  zip.file("script.txt", scriptLines.filter((l, i) => l !== "" || scriptLines[i - 1] !== "").join("\n"));

  // prompts.md
  const md: string[] = [`# ${project.title}`, "", `Idea: ${project.idea}`, ""];
  for (const c of clips) {
    md.push(`## Clip ${c.idx + 1} (${c.duration_s}s)`, "", `> ${c.dialogue}`, "");
    const still = prompts.find((p) => p.clip_id === c.id && p.kind === "still" && p.is_current);
    const video = prompts.find((p) => p.clip_id === c.id && p.kind === "video" && p.is_current);
    md.push("### Still prompt", "", "```", still?.body ?? "(none)", "```", "");
    md.push("### Video prompt", "", "```", video?.body ?? "(none)", "```", "");
    const mine = assets.filter((a) => a.clip_id === c.id && a.flow_url);
    const flowImage = mine.find((a) => a.kind === "image" && a.is_selected) ?? mine.find((a) => a.kind === "image");
    const flowVideo = mine.find((a) => a.kind === "video" && a.is_selected) ?? mine.find((a) => a.kind === "video");
    if (flowImage || flowVideo) {
      md.push("### Flow links", "");
      if (flowImage) md.push(`- Still: ${flowImage.flow_url}`);
      if (flowVideo) md.push(`- Video: ${flowVideo.flow_url}`);
      md.push("");
    }
  }
  zip.file("prompts.md", md.join("\n"));

  const cap = caption.data as { caption: string; hashtags: string[]; on_screen_text: string } | null;
  if (cap) {
    zip.file(
      "caption.txt",
      [cap.caption, "", cap.hashtags.join(" "), "", `On-screen text: ${cap.on_screen_text}`].join("\n"),
    );
  }

  // media: the selected image / video per clip
  async function addAsset(a: Asset, folder: string, name: string) {
    const { data } = await db().storage.from(bucketFor(a.kind)).download(a.storage_path);
    if (!data) return;
    zip.file(`${folder}/${name}.${extOf(a.storage_path, a.kind === "image" ? "png" : "mp4")}`, await data.arrayBuffer());
  }
  for (const c of clips) {
    const mine = assets.filter((a) => a.clip_id === c.id);
    const image = mine.find((a) => a.kind === "image" && a.is_selected) ?? mine.find((a) => a.kind === "image");
    const video = mine.find((a) => a.kind === "video" && a.is_selected) ?? mine.find((a) => a.kind === "video");
    if (image) await addAsset(image, "stills", `clip-${pad(c.idx + 1)}`);
    if (video) await addAsset(video, "clips", `clip-${pad(c.idx + 1)}`);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, name: `${safeFileName(project.title)}.zip` };
}
