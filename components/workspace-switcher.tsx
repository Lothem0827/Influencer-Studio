"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const currentName = workspaces.find((w) => w.slug === current)?.name ?? current;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {currentName}
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.slug} onSelect={() => router.push(`/w/${w.slug}`)}>
            {w.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
