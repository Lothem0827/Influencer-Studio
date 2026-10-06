import { notFound, redirect } from "next/navigation";
import { StillsBoard } from "@/components/wizard/stills-board";
import {
  getAssets,
  getClips,
  getIdentity,
  getPresets,
  getProject,
  getPrompts,
} from "@/lib/server/data";

export default async function StillsPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  if (!project.picked_script_id) redirect(`/w/${ws}/p/${id}/scripts`);

  const [clips, presets, identity] = await Promise.all([
    getClips(id, project.picked_script_id),
    getPresets(project.workspace_id),
    getIdentity(project.workspace_id),
  ]);
  const clipIds = clips.map((c) => c.id);
  const [prompts, assets] = await Promise.all([getPrompts(clipIds), getAssets(clipIds)]);
  const sampleAssetByClip: Record<string, string> = {};
  for (const asset of assets) {
    if (asset.kind === "image" && asset.is_selected) sampleAssetByClip[asset.clip_id] = asset.id;
  }

  return (
    <StillsBoard
      projectId={id}
      workspaceId={project.workspace_id}
      workspaceSlug={ws}
      language={project.language}
      clips={clips}
      prompts={prompts.filter((p) => p.kind === "still")}
      presets={presets}
      identity={identity}
      sampleAssetByClip={sampleAssetByClip}
    />
  );
}
