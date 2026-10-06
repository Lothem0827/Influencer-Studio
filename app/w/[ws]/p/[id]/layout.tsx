import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { Separator } from "@/components/ui/separator";
import { ProjectBrief } from "@/components/wizard/project-brief";
import { Stepper } from "@/components/wizard/stepper";
import { getIdentity, getProject, getWorkspaceBySlug, projectUsage } from "@/lib/server/data";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }
  if (project.workspace_id !== workspace.id) notFound();
  const [usage, identity] = await Promise.all([
    projectUsage(id).catch(() => null),
    getIdentity(workspace.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{project.title}</h1>
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.idea}</p>
        </div>
        <ProjectBrief
          projectId={project.id}
          title={project.title}
          idea={project.idea}
          pillar={project.pillar}
          pillars={(identity?.pillars ?? []).map((p) => p.name)}
          language={project.language}
          targetModel={project.target_model}
          aspectRatio={project.aspect_ratio}
        />
      </div>
      <Stepper
        base={`/w/${ws}/p/${id}`}
        hasPicked={Boolean(project.picked_script_id)}
        status={project.status}
      />
      <LiveRefresh projectId={id} />
      {children}
      <Separator />
      <footer className="text-xs text-muted-foreground">
        {usage
          ? `LLM usage for this project: ${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out tokens, about $${usage.cost.toFixed(4)}`
          : "LLM usage unavailable"}
      </footer>
    </div>
  );
}
