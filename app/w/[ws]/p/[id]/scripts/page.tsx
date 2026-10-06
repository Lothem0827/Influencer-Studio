import { notFound } from "next/navigation";
import { ScriptsBoard } from "@/components/wizard/scripts-board";
import { maxClipSecondsFor, resolveClipSeconds } from "@/lib/prompts/build";
import { getProject, getScripts } from "@/lib/server/data";
import type { Script } from "@/lib/supabase/types";

export default async function ScriptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { ws, id } = await params;
  const { error } = await searchParams;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  const all = await getScripts(id);
  const byId = new Map(all.map((s) => [s.id, s]));

  // Each current script plus its ancestor versions (newest first).
  const entries = all
    .filter((s) => s.is_current)
    .map((current) => {
      const history: Script[] = [];
      let p = current.parent_id;
      while (p) {
        const prev = byId.get(p);
        if (!prev) break;
        history.push(prev);
        p = prev.parent_id;
      }
      return { current, history };
    });

  return (
    <ScriptsBoard
      workspaceSlug={ws}
      projectId={id}
      language={project.language}
      clipSeconds={resolveClipSeconds(project.target_model, project.clip_seconds)}
      maxClipSeconds={maxClipSecondsFor(project.target_model)}
      pickedScriptId={project.picked_script_id}
      hasLaterWork={project.status !== "scripts" && project.status !== "idea"}
      initialError={error ?? null}
      entries={entries}
    />
  );
}
