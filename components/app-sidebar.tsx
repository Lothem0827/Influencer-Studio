"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  Calendar,
  LayoutDashboard,
  Library,
  Plus,
  Settings2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const LINKS = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Library },
  { href: "/prompts", label: "Prompts", icon: Bookmark },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/trends", label: "Trend to script", icon: TrendingUp },
  { href: "/studio", label: "Studio", icon: Settings2 },
];

export function AppSidebar({ current }: { current: string }) {
  const pathname = usePathname();
  const base = `/w/${current}`;
  const newHref = `${base}/new`;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Influencer Studio"
              className="group-data-[collapsible=icon]:justify-center"
            >
              <Link href="/">
                <Sparkles />
                <span className="group-data-[collapsible=icon]:hidden">Influencer Studio</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild variant="primary" isActive={pathname.startsWith(newHref)} tooltip="New project">
              <Link href={newHref} aria-current={pathname.startsWith(newHref) ? "page" : undefined}>
                <Plus />
                <span>New project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((l) => {
                const href = `${base}${l.href}`;
                const active = l.href === "" ? pathname === base : pathname.startsWith(href);
                const Icon = l.icon;
                return (
                  <SidebarMenuItem key={l.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={l.label}>
                      <Link href={href} aria-current={active ? "page" : undefined}>
                        <Icon />
                        <span>{l.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
