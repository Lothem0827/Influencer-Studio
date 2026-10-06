import "server-only";
import { generateJSON } from "@/lib/llm";
import { db, must } from "@/lib/server/supabase";
import { getPromptContext, getProject, resolveTemplate } from "@/lib/server/data";
import { downloadAssetBase64 } from "@/lib/server/assets";
import { advanceClip, bumpProject, insertPromptVersion } from "@/lib/server/pipeline";
import { buildSystemPrompt, renderVideo, videoUserPrompt } from "@/lib/prompts/build";
import { VideoPrompt } from "@/lib/schemas";
import { checkVideoPrompt } from "@/lib/rules";
import type { Asset, Clip, Prompt } from "@/lib/supabase/types";

/** Vision call: selected still + script line -> motion-only video prompt. */
export async function generateVideoPrompt(clipId: string, steerNote?: string): Promise<Prompt> {
  const clip = must(await db().from("clips").select("*").eq("id", clipId).single(), "clip") as Clip;
  const project = await getProject(clip.project_id);

  const image = (
    must(
      await db()
        .from("assets")
        .select("*")
        .eq("clip_id", clip.id)
        .eq("kind", "image")
        .eq("is_selected", true)
        .order("created_at", { ascending: false })
        .limit(1),
      "image",
    ) as Asset[]
  )[0];
  if (!image) throw new Error(`Clip ${clip.idx + 1} has no still image yet. Add one first.`);

  const [ctx, template, img, stillRow, videoRow] = await Promise.all([
    getPromptContext(project.workspace_id),
    resolveTemplate(project.workspace_id, "video"),
    downloadAssetBase64(image),
    db().from("prompts").select("body").eq("clip_id", clip.id).eq("kind", "still").eq("is_current", true).maybeSingle(),
    db().from("prompts").select("body").eq("clip_id", clip.id).eq("kind", "video").eq("is_current", true).maybeSingle(),
  ]);

  const { data } = await generateJSON(
    VideoPrompt,
    buildSystemPrompt(template, ctx),
    videoUserPrompt({
      dialogue: clip.dialogue,
      action: clip.action,
      durationS: clip.duration_s,
      targetModel: project.target_model,
      aspectRatio: project.aspect_ratio,
      stillPrompt: (stillRow.data as { body: string } | null)?.body,
      previousPrompt: (videoRow.data as { body: string } | null)?.body,
      steerNote,
    }),
    { step: "video", projectId: project.id, images: [img], temperature: 0.7 },
  );

  const body = renderVideo({ video: data, dialogue: clip.dialogue, durationS: clip.duration_s });
  const prompt = await insertPromptVersion({
    clipId: clip.id,
    kind: "video",
    body,
    checker: checkVideoPrompt(body, { identity: ctx.identity, dialogue: clip.dialogue, durationS: clip.duration_s }),
  });
  await advanceClip(clip.id, "video_prompted");
  await bumpProject(project.id, "videos");
  return prompt;
}
