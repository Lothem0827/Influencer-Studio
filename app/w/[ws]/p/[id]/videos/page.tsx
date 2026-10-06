import { notFound, redirect } from "next/navigation";
import { VideosBoard } from "@/components/wizard/videos-board";
import { getAssets, getClips, getIdentity, getProject, getPrompts, signAssets } from "@/lib/server/data";

export default async function VideosPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  if (!project.picked_script_id) redirect(`/w/${ws}/p/${id}/scripts`);

  const clips = await getClips(id, project.picked_script_id);
  const ids = clips.map((c) => c.id);
  const [prompts, assets, identity] = await Promise.all([getPrompts(ids), getAssets(ids), getIdentity(project.workspace_id)]);
  const urls = await signAssets(assets);

  return (
    <VideosBoard
      projectId={id}
      workspaceId={project.workspace_id}
      workspaceSlug={ws}
      language={project.language}
      clips={clips}
      prompts={prompts.filter((p) => p.kind === "video")}
      stillPrompts={prompts.filter((p) => p.kind === "still" && p.is_current)}
      assets={assets.map((a) => ({ ...a, url: urls[a.id] ?? null }))}
      identity={identity}
    />
  );
}
