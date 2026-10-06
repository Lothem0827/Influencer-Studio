"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectStatus } from "@/lib/supabase/types";

const STEPS = [
  { key: "scripts", label: "Scripts", reached: 1 },
  { key: "stills", label: "Still prompts", reached: 2 },
  { key: "videos", label: "Images and videos", reached: 3 },
  { key: "finish", label: "Finish", reached: 4 },
] as const;

const RANK: Record<ProjectStatus, number> = { idea: 0, scripts: 1, stills: 2, videos: 3, finished: 4 };

export function Stepper({
  base,
  hasPicked,
  status,
}: {
  base: string;
  hasPicked: boolean;
  status: ProjectStatus;
}) {
  const pathname = usePathname();
  const rank = RANK[status];

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, i) => {
        const href = `${base}/${s.key}`;
        const active = pathname.startsWith(href);
        // A step is reachable once a script is picked (or it is the scripts step).
        const enabled = s.key === "scripts" || hasPicked;
        const done = rank > s.reached || (rank === s.reached && !active && enabled && s.key !== "scripts");
        const marker = (
          <Badge variant={active ? "default" : "secondary"} className="size-5 px-0">
            {done && !active ? <Check /> : i + 1}
          </Badge>
        );
        return (
          <li key={s.key}>
            {enabled ? (
              <Button
                asChild
                variant={active ? "secondary" : "outline"}
                className={active ? "rounded-full border-primary" : "rounded-full text-muted-foreground"}
              >
                <Link href={href} aria-current={active ? "step" : undefined}>
                  {marker}
                  {s.label}
                </Link>
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <Button
                      variant="outline"
                      disabled
                      className="rounded-full text-muted-foreground"
                    >
                      {marker}
                      {s.label}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Pick a script first</TooltipContent>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ol>
  );
}
