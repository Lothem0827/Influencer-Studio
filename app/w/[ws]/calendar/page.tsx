import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { addScheduledPost, deleteScheduledPost, setScheduledStatus } from "@/app/actions/extras";
import { ConfirmDeleteForm } from "@/components/confirm-delete";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { getIdentity, getWorkspaceBySlug, listProjects } from "@/lib/server/data";
import { db, must } from "@/lib/server/supabase";
import type { ScheduledPost } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { ws } = await params;
  const { m } = await searchParams;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();

  const now = new Date();
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  const [identity, projects] = await Promise.all([getIdentity(workspace.id), listProjects(workspace.id)]);
  const posts = must(
    await db()
      .from("scheduled_posts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .gte("scheduled_for", ymd(first))
      .lte("scheduled_for", `${year}-${pad(month + 1)}-${pad(daysInMonth)}`)
      .order("scheduled_for"),
    "posts",
  ) as ScheduledPost[];

  const byDay = new Map<number, ScheduledPost[]>();
  for (const p of posts) {
    const day = Number(p.scheduled_for.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }

  const pillars = identity?.pillars ?? [];
  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0) || 1;
  const counted = posts.filter((p) => p.pillar && p.status !== "skipped");
  const mix = pillars.map((p) => {
    const actual = counted.filter((x) => x.pillar === p.name).length;
    return {
      name: p.name,
      target: Math.round((p.weight / totalWeight) * 100),
      actual,
      pct: counted.length ? Math.round((actual / counted.length) * 100) : 0,
    };
  });
  // The pillar furthest below its target share is the suggestion for the next post.
  const suggestion = [...mix].sort((a, b) => a.pct - a.target - (b.pct - b.target))[0];

  const leading = (first.getDay() + 6) % 7; // Monday-first grid
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = ymd(now);

  const hidden = (
    <>
      <input type="hidden" name="slug" value={ws} />
      <input type="hidden" name="workspace_id" value={workspace.id} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Content calendar</h1>
          <p className="text-sm text-muted-foreground">Plan posts and keep the pillar mix on target.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href={`/w/${ws}/calendar?m=${key(prev)}`} aria-label="Previous month">
              <ChevronLeft />
            </Link>
          </Button>
          <span className="w-36 text-center text-sm font-medium">
            {first.toLocaleString("en", { month: "long", year: "numeric" })}
          </span>
          <Button asChild variant="ghost" size="icon">
            <Link href={`/w/${ws}/calendar?m=${key(next)}`} aria-label="Next month">
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border bg-border text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-card px-2 py-1.5 text-center text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const date = day ? `${year}-${pad(month + 1)}-${pad(day)}` : "";
              return (
                <div key={i} className={cn("min-h-24 min-w-0 bg-background p-1.5", day === null && "bg-card/50")}>
                  {day ? (
                    <>
                      <div className={cn("mb-1 text-[11px]", date === today ? "font-bold text-primary" : "text-muted-foreground")}>
                        {day}
                      </div>
                      <div className="flex flex-col gap-1">
                        {(byDay.get(day) ?? []).map((p) => (
                          <div
                            key={p.id}
                            className={cn(
                              "group min-w-0 rounded border bg-card p-1",
                              p.status === "posted" && "border-success/40",
                              p.status === "skipped" && "opacity-50",
                            )}
                          >
                            <p className="line-clamp-2 break-words leading-tight">{p.title}</p>
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                              {p.pillar ? (
                                <Badge variant="secondary" className="h-4 max-w-full px-1.5 text-[10px]">
                                  <span className="truncate">{p.pillar}</span>
                                </Badge>
                              ) : (
                                <span />
                              )}
                              <div className="flex items-center opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                <form action={setScheduledStatus}>
                                  {hidden}
                                  <input type="hidden" name="id" value={p.id} />
                                  <input type="hidden" name="status" value={p.status === "posted" ? "planned" : "posted"} />
                                  <Button type="submit" variant="ghost" size="xs" className="text-success">
                                    {p.status === "posted" ? "undo" : "posted"}
                                  </Button>
                                </form>
                                <ConfirmDeleteForm
                                  action={deleteScheduledPost}
                                  title="Remove this planned post?"
                                  description="This does not delete the linked project."
                                  trigger={
                                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete post" className="text-destructive">
                                      <Trash2 />
                                    </Button>
                                  }
                                >
                                  {hidden}
                                  <input type="hidden" name="id" value={p.id} />
                                </ConfirmDeleteForm>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule a post</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addScheduledPost}>
                {hidden}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="cal-title">Title</FieldLabel>
                    <Input id="cal-title" name="title" required placeholder="Pahinga ay hindi pagsuko" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cal-date">Date</FieldLabel>
                    <Input
                      id="cal-date"
                      type="date"
                      name="scheduled_for"
                      required
                      defaultValue={today.startsWith(key(first)) ? today : ymd(first)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cal-pillar">Pillar</FieldLabel>
                    <NativeSelect id="cal-pillar" name="pillar" defaultValue={suggestion?.name ?? ""} className="w-full">
                      <NativeSelectOption value="">None</NativeSelectOption>
                      {pillars.map((p) => (
                        <NativeSelectOption key={p.name}>{p.name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {suggestion ? (
                      <FieldDescription>Suggested: {suggestion.name} (below target)</FieldDescription>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cal-project">Project (optional)</FieldLabel>
                    <NativeSelect id="cal-project" name="project_id" defaultValue="" className="w-full">
                      <NativeSelectOption value="">None</NativeSelectOption>
                      {projects.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.title}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <SubmitButton>Add to calendar</SubmitButton>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pillar mix this month</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {mix.length === 0 ? (
                <p className="text-sm text-muted-foreground">Set pillars in the Studio page.</p>
              ) : (
                mix.map((p) => (
                  <div key={p.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.actual} post{p.actual === 1 ? "" : "s"} - {p.pct}% / target {p.target}%
                      </span>
                    </div>
                    <div className="relative">
                      <Progress value={p.pct} aria-label={`${p.name} share`} />
                      <div className="absolute -top-0.5 h-3 w-0.5 bg-foreground/70" style={{ left: `${p.target}%` }} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
