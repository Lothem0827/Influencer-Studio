"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, History, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import {
  generateScriptsAction,
  pickScriptAction,
  regenerateScriptAction,
  regenerateScriptClipAction,
  restoreScriptAction,
  saveScriptAction,
} from "@/app/actions/wizard";
import { ErrorNote, useRun } from "@/components/use-run";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { checkDialogueFits } from "@/lib/rules";
import { cn, wordCount } from "@/lib/utils";
import type { Script, ScriptClip } from "@/lib/supabase/types";

interface Entry {
  current: Script;
  history: Script[];
}

export function ScriptsBoard({
  workspaceSlug,
  projectId,
  language,
  clipSeconds,
  maxClipSeconds,
  pickedScriptId,
  hasLaterWork,
  initialError,
  entries,
}: {
  workspaceSlug: string;
  projectId: string;
  language: string;
  clipSeconds: number;
  maxClipSeconds: number;
  pickedScriptId: string | null;
  hasLaterWork: boolean;
  initialError: string | null;
  entries: Entry[];
}) {
  const { run, pending, error } = useRun();
  const [count, setCount] = useState(3);
  const [steer, setSteer] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-semibold">Step 2: Scripts</h2>
          <p className="text-sm text-muted-foreground">
            Edit, regenerate with a steer note, or pick one. Picking locks it in and moves on.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Field className="w-auto">
            <FieldLabel htmlFor="script-count" className="text-xs text-muted-foreground">
              Options
            </FieldLabel>
            <NativeSelect
              id="script-count"
              className="w-20"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="w-80 shrink-0">
            <FieldLabel htmlFor="script-steer" className="text-xs text-muted-foreground">
              Steer note (optional)
            </FieldLabel>
            <Input
              id="script-steer"
              className="w-full"
              placeholder="Make this more compassionate..."
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
            />
          </Field>
          <Button
            disabled={pending}
            onClick={() =>
              run(() => generateScriptsAction({ projectId, count, steerNote: steer || undefined }))
            }
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : entries.length ? (
              <RefreshCw data-icon="inline-start" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {pending ? "Writing..." : entries.length ? "Regenerate all" : "Generate scripts"}
          </Button>
        </div>
      </div>

      <ErrorNote message={error ?? initialError} />
      {entries.some((e) => e.current.id === pickedScriptId) ? (
        <p className="text-xs text-muted-foreground">
          The picked script is kept when you regenerate all. Regenerate it individually to replace it.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No scripts yet</EmptyTitle>
            <EmptyDescription>Generate some from the idea.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => (
            <ScriptCard
              key={e.current.id}
              entry={e}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              language={language}
              clipSeconds={clipSeconds}
              maxClipSeconds={maxClipSeconds}
              picked={e.current.id === pickedScriptId}
              confirmPick={hasLaterWork && pickedScriptId !== null && e.current.id !== pickedScriptId}
              busy={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptCard({
  entry,
  projectId,
  workspaceSlug,
  language,
  clipSeconds,
  maxClipSeconds,
  picked,
  confirmPick,
  busy,
}: {
  entry: Entry;
  projectId: string;
  workspaceSlug: string;
  language: string;
  clipSeconds: number;
  maxClipSeconds: number;
  picked: boolean;
  confirmPick: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  const s = entry.current;
  const [editing, setEditing] = useState(false);
  const [steering, setSteering] = useState(false);
  const [steer, setSteer] = useState("");
  const [clipSteerIndex, setClipSteerIndex] = useState<number | null>(null);
  const [clipSteer, setClipSteer] = useState("");
  const [title, setTitle] = useState(s.title);
  const [hook, setHook] = useState(s.hook);
  const [clips, setClips] = useState<ScriptClip[]>(s.body.clips);
  const disabled = pending || busy;

  function startEdit() {
    setTitle(s.title);
    setHook(s.hook);
    setClips(s.body.clips);
    setEditing(true);
  }

  function updateClip(i: number, patch: Partial<ScriptClip>) {
    setClips((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function regenerate() {
    run(() => regenerateScriptAction({ projectId, scriptId: s.id, steerNote: steer || undefined }), () => {
      setSteering(false);
      setSteer("");
    });
  }

  function openClipSteer(i: number) {
    setClipSteerIndex(i);
    setClipSteer("");
  }

  function regenerateClip(i: number) {
    run(
      () =>
        regenerateScriptClipAction({
          projectId,
          scriptId: s.id,
          clipIndex: i,
          steerNote: clipSteer || undefined,
        }),
      () => {
        setClipSteerIndex(null);
        setClipSteer("");
      },
    );
  }

  function pick() {
    run(() => pickScriptAction(s.id), () => router.push(`/w/${workspaceSlug}/p/${projectId}/stills`));
  }

  const pickLabel = (
    <>
      <Check data-icon="inline-start" /> {picked ? "Continue with this script" : "Pick"}
    </>
  );

  return (
    <Card className={cn(picked && "ring-primary")}>
      <CardHeader>
        {editing ? (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        ) : (
          <CardTitle className="text-base">{s.title}</CardTitle>
        )}
        <div className="flex flex-wrap gap-1.5">
          {picked ? <Badge variant="success">Picked</Badge> : null}
          {s.version > 1 ? <Badge variant="secondary">v{s.version}</Badge> : null}
          {s.steer_note ? <Badge>steer: {s.steer_note}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Hook</p>
          {editing ? (
            <Input value={hook} onChange={(e) => setHook(e.target.value)} aria-label="Hook" />
          ) : (
            <p className="text-sm">{s.hook}</p>
          )}
        </div>

        <ol className="flex flex-col gap-2">
          {(editing ? clips : s.body.clips).map((c, i) => {
            const warnings = checkDialogueFits(c.dialogue, c.duration_s, language);
            return (
              <li key={i}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Clip {i + 1} - {wordCount(c.dialogue)} words
                      </span>
                      {editing ? (
                        <span className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            max={maxClipSeconds}
                            value={c.duration_s}
                            onChange={(e) =>
                              updateClip(i, {
                                duration_s: Math.min(maxClipSeconds, Math.max(1, Number(e.target.value) || 1)),
                              })
                            }
                            className="h-7 w-16 px-2 text-xs"
                            aria-label="Duration seconds"
                          />
                          s
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={clips.length <= 1}
                            onClick={() => setClips((p) => p.filter((_, idx) => idx !== i))}
                            aria-label="Remove clip"
                          >
                            <Trash2 />
                          </Button>
                        </span>
                      ) : (
                        <span>{c.duration_s}s</span>
                      )}
                    </div>
                    {editing ? (
                      <div className="flex flex-col gap-1.5">
                        <Textarea
                          rows={2}
                          value={c.dialogue}
                          onChange={(e) => updateClip(i, { dialogue: e.target.value })}
                          aria-label="Dialogue"
                        />
                        <Textarea
                          rows={2}
                          value={c.action}
                          onChange={(e) => updateClip(i, { action: e.target.value })}
                          aria-label="Action"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">&ldquo;{c.dialogue}&rdquo;</p>
                        <p className="text-xs text-muted-foreground">{c.action}</p>
                      </>
                    )}
                    {warnings.map((w) => (
                      <p
                        key={w.message}
                        className={cn("text-xs", w.severity === "error" ? "text-destructive" : "text-warning")}
                      >
                        {w.message}
                      </p>
                    ))}
                    {!editing && clipSteerIndex === i ? (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          placeholder="Make this more compassionate..."
                          aria-label={`Prompt for clip ${i + 1}`}
                          value={clipSteer}
                          onChange={(e) => setClipSteer(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") regenerateClip(i);
                          }}
                        />
                        <Button size="sm" disabled={disabled} onClick={() => regenerateClip(i)}>
                          {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Go
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setClipSteerIndex(null)}
                          aria-label="Cancel"
                        >
                          <X />
                        </Button>
                      </div>
                    ) : null}
                    {!editing && clipSteerIndex !== i ? (
                      <div>
                        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => openClipSteer(i)}>
                          <RefreshCw data-icon="inline-start" /> Regenerate
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>

        {editing ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              disabled={clips.length >= 10}
              onClick={() => setClips((p) => [...p, { dialogue: "", action: "", duration_s: clipSeconds }])}
            >
              <Plus data-icon="inline-start" /> Add clip
            </Button>
          </div>
        ) : null}

        <ErrorNote message={error} />

        {steering ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Make this more compassionate..."
              aria-label="Steer note"
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") regenerate();
              }}
            />
            <Button size="sm" disabled={disabled} onClick={regenerate}>
              {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Go
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setSteering(false)} aria-label="Cancel">
              <X />
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  run(
                    () => saveScriptAction({ scriptId: s.id, projectId, title, hook, clips }),
                    () => setEditing(false),
                  )
                }
              >
                <Check data-icon="inline-start" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={disabled} onClick={startEdit}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => setSteering((v) => !v)}>
                {pending && !steering ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}{" "}
                Regenerate script
              </Button>
              {confirmPick ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={disabled} variant={picked ? "secondary" : "default"}>
                      {pickLabel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Switch to this script?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Switching scripts replaces the current clips and their prompts and images.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={pick}>Switch script</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button size="sm" disabled={disabled} variant={picked ? "secondary" : "default"} onClick={pick}>
                  {pickLabel}
                </Button>
              )}
            </>
          )}
        </div>

        {entry.history.length ? (
          <Accordion type="single" collapsible className="text-xs">
            <AccordionItem value="history" className="border-b-0">
              <AccordionTrigger className="py-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <History className="size-3.5" /> {entry.history.length} earlier version
                  {entry.history.length > 1 ? "s" : ""}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-2">
                  {entry.history.map((h) => (
                    <li key={h.id}>
                      <Card size="sm">
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              v{h.version}: {h.title}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={disabled}
                              onClick={() => run(() => restoreScriptAction(h.id, projectId))}
                            >
                              Restore
                            </Button>
                          </div>
                          <p className="text-muted-foreground">{h.hook}</p>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
