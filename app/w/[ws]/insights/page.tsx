import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addMetric, deleteMetric } from "@/app/actions/extras";
import { ConfirmDeleteForm } from "@/components/confirm-delete";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceBySlug, listProjects } from "@/lib/server/data";
import { db, must } from "@/lib/server/supabase";
import type { PostMetric } from "@/lib/supabase/types";

const fmt = (n: number) => n.toLocaleString("en");
const rate = (m: Pick<PostMetric, "views" | "likes" | "comments" | "shares">) =>
  m.views ? ((m.likes + m.comments + m.shares) / m.views) * 100 : 0;

type GroupRow = { key: string; posts: number; avgViews: number; avgRate: number };

function StatsCard({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log a few posts to see this.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead>Avg views</TableHead>
                <TableHead>Engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.key}</TableCell>
                  <TableCell>{r.posts}</TableCell>
                  <TableCell>{fmt(r.avgViews)}</TableCell>
                  <TableCell>{r.avgRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default async function InsightsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const projects = await listProjects(workspace.id);
  const byId = new Map(projects.map((p) => [p.id, p]));

  const metrics = projects.length
    ? (must(
        await db()
          .from("post_metrics")
          .select("*")
          .in("project_id", projects.map((p) => p.id))
          .order("created_at", { ascending: false }),
        "metrics",
      ) as PostMetric[])
    : [];

  // clip counts for "what's working" by length
  const clipRows = projects.length
    ? (must(await db().from("clips").select("project_id").in("project_id", projects.map((p) => p.id)), "clips") as { project_id: string }[])
    : [];
  const clipCount = new Map<string, number>();
  for (const c of clipRows) clipCount.set(c.project_id, (clipCount.get(c.project_id) ?? 0) + 1);

  function group(keyOf: (m: PostMetric) => string | null): GroupRow[] {
    const map = new Map<string, PostMetric[]>();
    for (const m of metrics) {
      const k = keyOf(m);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()]
      .map(([k, list]) => ({
        key: k,
        posts: list.length,
        avgViews: Math.round(list.reduce((s, m) => s + m.views, 0) / list.length),
        avgRate: list.reduce((s, m) => s + rate(m), 0) / list.length,
      }))
      .sort((a, b) => b.avgViews - a.avgViews);
  }

  const byPillar = group((m) => byId.get(m.project_id)?.pillar ?? null);
  const byLength = group((m) => {
    const n = clipCount.get(m.project_id);
    return n ? `${n} clip${n > 1 ? "s" : ""}` : null;
  });
  const top = [...metrics].sort((a, b) => b.views - a.views).slice(0, 5);
  const best = byPillar[0];

  const hidden = <input type="hidden" name="slug" value={ws} />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Log how posts performed, then see which pillars and lengths are working.
          {best ? ` Best pillar so far: ${best.key} (${fmt(best.avgViews)} avg views).` : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsCard title="What's working: by pillar" rows={byPillar} />
        <StatsCard title="What's working: by length" rows={byLength} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top posts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            top.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span>{byId.get(m.project_id)?.title ?? "Deleted project"}</span>
                <span className="text-muted-foreground">
                  {fmt(m.views)} views - {rate(m).toFixed(1)}% engagement
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log a post</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a project first, then log how the post performed.</p>
          ) : (
          <form action={addMetric}>
            {hidden}
            <FieldGroup className="sm:grid sm:grid-cols-3 lg:grid-cols-6">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="m-project">Project</FieldLabel>
                <NativeSelect id="m-project" name="project_id" required defaultValue="" className="w-full">
                  <NativeSelectOption value="" disabled>
                    Choose...
                  </NativeSelectOption>
                  {projects.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="m-posted">Posted on</FieldLabel>
                <Input id="m-posted" type="date" name="posted_at" />
              </Field>
              <Field>
                <FieldLabel htmlFor="m-platform">Platform</FieldLabel>
                <NativeSelect id="m-platform" name="platform" defaultValue="tiktok" className="w-full">
                  <NativeSelectOption>tiktok</NativeSelectOption>
                  <NativeSelectOption>reels</NativeSelectOption>
                  <NativeSelectOption>shorts</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="m-url">URL</FieldLabel>
                <Input id="m-url" name="url" placeholder="https://..." />
              </Field>
              <Field>
                <FieldLabel htmlFor="m-views">Views</FieldLabel>
                <Input id="m-views" type="number" name="views" min={0} defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel htmlFor="m-likes">Likes</FieldLabel>
                <Input id="m-likes" type="number" name="likes" min={0} defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel htmlFor="m-comments">Comments</FieldLabel>
                <Input id="m-comments" type="number" name="comments" min={0} defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel htmlFor="m-shares">Shares</FieldLabel>
                <Input id="m-shares" type="number" name="shares" min={0} defaultValue={0} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="m-notes">Notes</FieldLabel>
                <Input id="m-notes" name="notes" placeholder="Hook that worked, comments..." />
              </Field>
              <div className="flex items-end">
                <SubmitButton>Log post</SubmitButton>
              </div>
            </FieldGroup>
          </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logged posts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {metrics.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <span className="min-w-0 flex-1 truncate">{byId.get(m.project_id)?.title ?? "Deleted project"}</span>
              <Badge variant="secondary">{m.platform}</Badge>
              <span className="w-24 text-right text-muted-foreground">{fmt(m.views)} views</span>
              <span className="w-24 text-right text-muted-foreground">{rate(m).toFixed(1)}%</span>
              <ConfirmDeleteForm
                action={deleteMetric}
                title="Delete this log entry?"
                description="This only removes the performance numbers, not the project."
                trigger={
                  <Button size="icon-sm" variant="ghost" type="button" aria-label="Delete entry">
                    <Trash2 />
                  </Button>
                }
              >
                {hidden}
                <input type="hidden" name="id" value={m.id} />
              </ConfirmDeleteForm>
            </div>
          ))}
          {metrics.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
