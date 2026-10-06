import { notFound, redirect } from "next/navigation";
import { FinishPanel } from "@/components/wizard/finish-panel";
import { getAssets, getClips, getProject } from "@/lib/server/data";
import { db } from "@/lib/server/supabase";
import type { Caption } from "@/lib/supabase/types";

export default async function FinishPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  if (!project.picked_script_id) redirect(`/w/${ws}/p/${id}/scripts`);

  const clips = await getClips(id, project.picked_script_id);
  const [assets, captionRes] = await Promise.all([
    getAssets(clips.map((c) => c.id)),
    db().from("captions").select("*").eq("project_id", id).maybeSingle(),
  ]);

  const caption = (captionRes.data as Caption | null) ?? null;

  return (
    <FinishPanel
      key={caption ? `${caption.id}:${caption.caption.length}:${caption.hashtags.join()}` : "none"}
      projectId={id}
      workspaceSlug={ws}
      tags={project.tags ?? []}
      caption={caption}
      clipCount={clips.length}
      imageCount={new Set(assets.filter((a) => a.kind === "image").map((a) => a.clip_id)).size}
      videoCount={new Set(assets.filter((a) => a.kind === "video").map((a) => a.clip_id)).size}
    />
  );
}
