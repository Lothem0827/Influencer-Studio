import { notFound } from "next/navigation";
import { TrendTool } from "@/components/trends/trend-tool";
import { getWorkspaceBySlug } from "@/lib/server/data";

export default async function TrendsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Trend to script</h1>
        <p className="text-sm text-muted-foreground">
          Break a trending video into beats, then write a version in {workspace.name}&apos;s voice.
        </p>
      </div>
      <TrendTool workspaceId={workspace.id} workspaceSlug={ws} />
    </div>
  );
}
