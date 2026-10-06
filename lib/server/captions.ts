import "server-only";
import { generateJSON } from "@/lib/llm";
import { db, must } from "@/lib/server/supabase";
import { getClips, getPromptContext, getProject, resolveTemplate } from "@/lib/server/data";
import { bumpProject } from "@/lib/server/pipeline";
import { buildSystemPrompt, captionUserPrompt } from "@/lib/prompts/build";
import { CaptionPack } from "@/lib/schemas";
import type { Caption } from "@/lib/supabase/types";

function normalizeTags(tags: string[]): string[] {
  return tags
    .map((t) => t.trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .slice(0, 4);
}

export async function generateCaption(projectId: string, steerNote?: string): Promise<Caption> {
  const project = await getProject(projectId);
  const clips = await getClips(project.id, project.picked_script_id);
  if (!clips.length) throw new Error("Pick a script first.");
  const [ctx, template] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "caption"),
  ]);
  const { data } = await generateJSON(
    CaptionPack,
    buildSystemPrompt(template, ctx),
    captionUserPrompt({
      title: project.title,
      idea: project.idea,
      language: project.language,
      pillar: project.pillar,
      clips,
      steerNote,
    }),
    { step: "caption", projectId: project.id },
  );
  return saveCaption(project.id, {
    caption: data.caption,
    hashtags: data.hashtags,
    on_screen_text: data.on_screen_text,
  });
}

export async function saveCaption(
  projectId: string,
  c: { caption: string; hashtags: string[]; on_screen_text: string },
): Promise<Caption> {
  const row = must(
    await db()
      .from("captions")
      .upsert(
        {
          project_id: projectId,
          caption: c.caption,
          hashtags: normalizeTags(c.hashtags),
          on_screen_text: c.on_screen_text,
        },
        { onConflict: "project_id" },
      )
      .select("*")
      .single(),
    "save caption",
  ) as Caption;
  await bumpProject(projectId, "finished");
  return row;
}
