import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { getIdentity, getWorkspaceBySlug, listProjects } from "@/lib/server/data";
import { projectHref, STATUS_LABEL } from "@/lib/routes";

export default async function Dashboard({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const [projects, identity] = await Promise.all([listProjects(workspace.id), getIdentity(workspace.id)]);

  const pillars = identity?.pillars ?? [];
  const totalTarget = pillars.reduce((s, p) => s + p.weight, 0) || 1;
  const counts = new Map<string, number>();
  for (const p of projects) if (p.pillar) counts.set(p.pillar, (counts.get(p.pillar) ?? 0) + 1);
  const totalProjects = [...counts.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">{workspace.niche}</p>
        </div>
        <Button asChild>
          <Link href={`/w/${ws}/new`}>
            <Plus data-icon="inline-start" /> New project
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {projects.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderOpen />
                  </EmptyMedia>
                  <EmptyTitle>No projects yet</EmptyTitle>
                  <EmptyDescription>Start with an idea.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              projects.slice(0, 12).map((p) => (
                <Link
                  key={p.id}
                  href={projectHref(ws, p)}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.idea}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.pillar ? <Badge variant="secondary">{p.pillar}</Badge> : null}
                    <Badge>{STATUS_LABEL[p.status]}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pillar mix</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pillars.length === 0 ? (
              <p className="text-sm text-muted-foreground">Set content pillars in the Studio page.</p>
            ) : (
              pillars.map((p) => {
                const target = Math.round((p.weight / totalTarget) * 100);
                const actual = totalProjects ? Math.round(((counts.get(p.name) ?? 0) / totalProjects) * 100) : 0;
                return (
                  <div key={p.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">
                        {actual}% / target {target}%
                      </span>
                    </div>
                    <div className="relative">
                      <Progress value={actual} aria-label={`${p.name} share`} />
                      <div
                        className="absolute -top-0.5 h-3 w-0.5 bg-foreground/70"
                        style={{ left: `${target}%` }}
                        title={`Target ${target}%`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
