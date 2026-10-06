import type { Project } from "@/lib/supabase/types";

export type StepKey = "scripts" | "stills" | "videos" | "finish";

export function projectHref(wsSlug: string, p: Pick<Project, "id" | "status">): string {
  const step: StepKey =
    p.status === "finished" ? "finish" : p.status === "videos" ? "videos" : p.status === "stills" ? "stills" : "scripts";
  return `/w/${wsSlug}/p/${p.id}/${step}`;
}

export const STATUS_LABEL: Record<Project["status"], string> = {
  idea: "Idea",
  scripts: "Scripts",
  stills: "Stills",
  videos: "Videos",
  finished: "Finished",
};
