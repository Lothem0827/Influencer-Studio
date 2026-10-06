import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { Separator } from "@/components/ui/separator";
import { Stepper } from "@/components/wizard/stepper";
import { getProject, projectUsage } from "@/lib/server/data";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }
  const usage = await projectUsage(id).catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{project.title}</h1>
        <p className="line-clamp-1 text-sm text-muted-foreground">{project.idea}</p>
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
