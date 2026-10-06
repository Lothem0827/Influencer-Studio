import { notFound, redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getWorkspaceBySlug, isConfigured, listWorkspaces } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  if (!isConfigured()) redirect("/");
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const all = await listWorkspaces();

  return (
    <SidebarProvider>
      <AppSidebar current={workspace.slug} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <WorkspaceSwitcher
            current={workspace.slug}
            workspaces={all.map((w) => ({ slug: w.slug, name: w.name }))}
          />
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
