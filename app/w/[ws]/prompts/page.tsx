import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, Search } from "lucide-react";
import { PromptLibrary } from "@/components/prompts/prompt-library";
import { SavePromptDialog } from "@/components/prompts/save-prompt-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getWorkspaceBySlug } from "@/lib/server/data";
import { listSavedPrompts, signSavedPrompts } from "@/lib/server/saved-prompts";

type SP = { q?: string; kind?: string };

export default async function PromptsPage({
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

  const rows = await listSavedPrompts(workspace.id, { q: sp.q, kind: sp.kind });
  const urls = await signSavedPrompts(rows);
  const items = rows.map((row) => ({ ...row, sampleUrl: urls[row.id] ?? null }));
  const filtered = Boolean(sp.q?.trim() || sp.kind);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Prompts</h1>
          <p className="text-sm text-muted-foreground">
            Named still and video prompts for {workspace.name}, with an optional sample result.
          </p>
        </div>
        <SavePromptDialog
          workspaceId={workspace.id}
          workspaceSlug={ws}
          kind="still"
          lockKind={false}
          trigger={
            <Button type="button">
              <Bookmark data-icon="inline-start" /> Add prompt
            </Button>
          }
        />
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput name="q" defaultValue={sp.q} placeholder="Search..." aria-label="Search prompts" />
        </InputGroup>
        <NativeSelect name="kind" defaultValue={sp.kind ?? ""} aria-label="Kind" className="w-40">
          <NativeSelectOption value="">All kinds</NativeSelectOption>
          <NativeSelectOption value="still">Still</NativeSelectOption>
          <NativeSelectOption value="video">Video</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered ? (
          <Button asChild variant="ghost" className="text-muted-foreground">
            <Link href={`/w/${ws}/prompts`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bookmark />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No prompts match" : "No saved prompts yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search or clear the filters."
                : "Save a prompt from a still or video card, or add one here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <PromptLibrary items={items} />
      )}
    </div>
  );
}
