import { notFound } from "next/navigation";
import { IdeaForm } from "@/components/wizard/idea-form";
import { getIdentity, getWorkspaceBySlug } from "@/lib/server/data";

export default async function NewProject({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const identity = await getIdentity(workspace.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Step 1: Idea</h1>
        <p className="text-sm text-muted-foreground">
          One idea in. The app writes script options, then still and video prompts for {workspace.name}.
        </p>
      </div>
      <IdeaForm
        workspaceId={workspace.id}
        workspaceSlug={ws}
        pillars={(identity?.pillars ?? []).map((p) => p.name)}
      />
    </div>
  );
}
