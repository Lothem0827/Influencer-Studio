import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderSearch, Search } from "lucide-react";
import { DeleteProjectButton } from "@/components/library/delete-project-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getIdentity, getWorkspaceBySlug, signAssets } from "@/lib/server/data";
import { db, must } from "@/lib/server/supabase";
import { projectHref, STATUS_LABEL } from "@/lib/routes";
import type { Asset, Clip, Project } from "@/lib/supabase/types";

type SP = { q?: string; pillar?: string; status?: string; tag?: string };

const like = (q: string) => `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

async function searchProjectIds(workspaceId: string, q: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const pattern = like(q);
  const projects = await db().from("projects").select("id").eq("workspace_id", workspaceId);
  const wsIds = new Set((projects.data ?? []).map((p) => p.id as string));

  const [byProject, byIdea, byScriptTitle, byHook, byDialogue, byPrompt, byCaption] = await Promise.all([
    db().from("projects").select("id").eq("workspace_id", workspaceId).ilike("title", pattern),
    db().from("projects").select("id").eq("workspace_id", workspaceId).ilike("idea", pattern),
    db().from("scripts").select("project_id").ilike("title", pattern),
    db().from("scripts").select("project_id").ilike("hook", pattern),
    db().from("clips").select("project_id").ilike("dialogue", pattern),
    db().from("prompts").select("clip_id").ilike("body", pattern),
    db().from("captions").select("project_id").ilike("caption", pattern),
  ]);
  for (const r of [byProject, byIdea]) for (const p of r.data ?? []) ids.add(p.id as string);
  for (const r of [byScriptTitle, byHook, byDialogue, byCaption]) for (const p of r.data ?? []) ids.add(p.project_id as string);

  const clipIds = (byPrompt.data ?? []).map((p) => p.clip_id as string);
  if (clipIds.length) {
    const { data } = await db().from("clips").select("project_id").in("id", clipIds);
    for (const c of data ?? []) ids.add(c.project_id as string);
  }
  return new Set([...ids].filter((id) => wsIds.has(id)));
}

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<SP>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspaceBySlug(ws);
  if (!workspace) notFound();
  const identity = await getIdentity(workspace.id);

  let query = db().from("projects").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
  if (sp.pillar) query = query.eq("pillar", sp.pillar);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.tag) query = query.contains("tags", [sp.tag.toLowerCase().replace(/^#/, "")]);
  let projects = must(await query, "projects") as Project[];

  if (sp.q?.trim()) {
    const ids = await searchProjectIds(workspace.id, sp.q.trim());
    projects = projects.filter((p) => ids.has(p.id));
  }

  // First selected still per project, as a thumbnail
  const clips = projects.length
    ? (must(await db().from("clips").select("id,project_id,idx").in("project_id", projects.map((p) => p.id)).order("idx"), "clips") as Pick<Clip, "id" | "project_id" | "idx">[])
    : [];
  const images = clips.length
    ? (must(
        await db().from("assets").select("*").in("clip_id", clips.map((c) => c.id)).eq("kind", "image").eq("is_selected", true),
        "assets",
      ) as Asset[])
    : [];
  const thumbByProject = new Map<string, Asset>();
  for (const c of clips) {
    const a = images.find((i) => i.clip_id === c.id);
    if (a && !thumbByProject.has(c.project_id)) thumbByProject.set(c.project_id, a);
  }
  const urls = await signAssets([...thumbByProject.values()]);

  const pillars = (identity?.pillars ?? []).map((p) => p.name);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground">
          Every project for {workspace.name}. Search covers ideas, scripts, dialogue, prompts and captions.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput name="q" defaultValue={sp.q} placeholder="Search..." aria-label="Search" />
        </InputGroup>
        <NativeSelect name="pillar" defaultValue={sp.pillar ?? ""} aria-label="Pillar" className="w-40">
          <NativeSelectOption value="">All pillars</NativeSelectOption>
          {pillars.map((p) => (
            <NativeSelectOption key={p}>{p}</NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="w-40">
          <NativeSelectOption value="">Any status</NativeSelectOption>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <NativeSelectOption key={k} value={k}>
              {v}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input name="tag" defaultValue={sp.tag} placeholder="tag" aria-label="Tag" className="w-32" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {sp.q || sp.pillar || sp.status || sp.tag ? (
          <Button asChild variant="ghost" className="text-muted-foreground">
            <Link href={`/w/${ws}/library`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {projects.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderSearch />
            </EmptyMedia>
            <EmptyTitle>{sp.q || sp.pillar || sp.status || sp.tag ? "No projects match" : "No projects yet"}</EmptyTitle>
            <EmptyDescription>
              {sp.q || sp.pillar || sp.status || sp.tag
                ? "Try a different search or clear the filters."
                : "Start from an idea. Finished stills show up here as thumbnails."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {sp.q || sp.pillar || sp.status || sp.tag ? (
              <Button asChild variant="outline">
                <Link href={`/w/${ws}/library`}>Clear filters</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/w/${ws}/new`}>New project</Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => {
            const thumb = thumbByProject.get(p.id);
            const url = thumb ? urls[thumb.id] : null;
            return (
              <Card key={p.id} className="pt-0">
                <Link href={projectHref(ws, p)} className="block">
                  <div className="flex aspect-video items-center justify-center bg-muted/40">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover object-top" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No still yet</span>
                    )}
                  </div>
                </Link>
                <CardContent className="flex flex-col gap-2">
                  <Link href={projectHref(ws, p)} className="block">
                    <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{p.idea}</p>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{STATUS_LABEL[p.status]}</Badge>
                    {p.pillar ? <Badge variant="secondary">{p.pillar}</Badge> : null}
                    {(p.tags ?? []).map((t) => (
                      <Link key={t} href={`/w/${ws}/library?tag=${encodeURIComponent(t)}`}>
                        <Badge variant="warning">#{t}</Badge>
                      </Link>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(p.created_at).toLocaleDateString()}</span>
                    <DeleteProjectButton projectId={p.id} title={p.title} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
