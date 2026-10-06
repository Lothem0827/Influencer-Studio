"use client";

import { useMemo, useState } from "react";
import { Bookmark, Check, History, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import {
  generateStillsAction,
  regenerateStillAction,
  restorePromptAction,
  saveStillAction,
  setClipPresetAction,
} from "@/app/actions/wizard";
import { CopyButton } from "@/components/copy-button";
import { SavePromptDialog } from "@/components/prompts/save-prompt-dialog";
import { SendToFlowButton, SendAllButton } from "@/components/send-to-flow";
import { DiscardEditsButton } from "@/components/confirm-delete";
import { ErrorNote, useRun } from "@/components/use-run";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { checkDialogueFits, checkStillPrompt } from "@/lib/rules";
import type { Clip, IdentityPack, Preset, Prompt } from "@/lib/supabase/types";

export function WarningList({ warnings }: { warnings: { rule: string; severity: string; message: string }[] }) {
  if (!warnings.length) {
    return <p className="text-xs text-success">Shot checker: all good.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {warnings.map((w) => (
        <li key={w.rule + w.message}>
          <Alert variant={w.severity === "error" ? "destructive" : "warning"} className="py-1 text-xs">
            <AlertDescription>{w.message}</AlertDescription>
          </Alert>
        </li>
      ))}
    </ul>
  );
}

export function StillsBoard({
  projectId,
  workspaceId,
  workspaceSlug,
  language,
  clips,
  prompts,
  presets,
  identity,
  sampleAssetByClip,
}: {
  projectId: string;
  workspaceId: string;
  workspaceSlug: string;
  language: string;
  clips: Clip[];
  prompts: Prompt[];
  presets: Preset[];
  identity: IdentityPack | null;
  sampleAssetByClip: Record<string, string>;
}) {
  const { run, pending, error } = useRun();
  const [steer, setSteer] = useState("");

  const byClip = useMemo(() => {
    const map = new Map<string, Prompt[]>();
    for (const p of prompts) map.set(p.clip_id, [...(map.get(p.clip_id) ?? []), p]);
    return map;
  }, [prompts]);

  const currents = clips.map((c) => byClip.get(c.id)?.find((p) => p.is_current)).filter(Boolean) as Prompt[];
  const allText = clips
    .map((c, i) => {
      const cur = byClip.get(c.id)?.find((p) => p.is_current);
      return cur ? `Clip ${i + 1}\n${cur.body}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-semibold">Step 3: Still prompts</h2>
          <p className="text-sm text-muted-foreground">
            One first-frame prompt per clip. Identity lock, wardrobe, location and house rules are injected automatically.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Input
            className="w-56"
            placeholder="Steer note (optional)"
            aria-label="Steer note"
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
          />
          <Button disabled={pending} onClick={() => run(() => generateStillsAction(projectId, steer || undefined))}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : currents.length ? (
              <RefreshCw data-icon="inline-start" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {pending ? "Writing..." : currents.length ? "Regenerate all" : "Generate still prompts"}
          </Button>
          {currents.length ? <CopyButton text={allText} label="Copy all" /> : null}
          {currents.length ? <SendAllButton projectId={projectId} kind="still" clipIds={clips.map((c) => c.id)} /> : null}
        </div>
      </div>
      <ErrorNote message={error} />

      <div className="flex flex-col gap-4">
        {clips.map((clip) => (
          <StillCard
            key={clip.id}
            clip={clip}
            projectId={projectId}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            language={language}
            versions={byClip.get(clip.id) ?? []}
            presets={presets}
            identity={identity}
            sampleAssetId={sampleAssetByClip[clip.id] ?? null}
            busy={pending}
          />
        ))}
      </div>
    </div>
  );
}

function StillCard({
  clip,
  projectId,
  workspaceId,
  workspaceSlug,
  language,
  versions,
  presets,
  identity,
  sampleAssetId,
  busy,
}: {
  clip: Clip;
  projectId: string;
  workspaceId: string;
  workspaceSlug: string;
  language: string;
  versions: Prompt[];
  presets: Preset[];
  identity: IdentityPack | null;
  sampleAssetId: string | null;
  busy: boolean;
}) {
  const { run, pending, error } = useRun();
  const current = versions.find((p) => p.is_current) ?? null;
  const history = versions.filter((p) => !p.is_current);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [steering, setSteering] = useState(false);
  const [steer, setSteer] = useState("");
  const disabled = pending || busy;

  const warnings = useMemo(
    () => [
      ...(current ? checkStillPrompt(current.body, { identity }) : []),
      ...checkDialogueFits(clip.dialogue, clip.duration_s, language),
    ],
    [current, identity, clip.dialogue, clip.duration_s, language],
  );

  const locations = presets.filter((p) => p.kind === "location");
  const wardrobes = presets.filter((p) => p.kind === "wardrobe");

  function regenerate() {
    run(() => regenerateStillAction(clip.id, projectId, steer || undefined), () => {
      setSteering(false);
      setSteer("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Clip {clip.idx + 1} <span className="font-normal text-muted-foreground">- {clip.duration_s}s</span>
        </CardTitle>
        <CardDescription>
          <span className="block text-sm text-foreground">&ldquo;{clip.dialogue}&rdquo;</span>
          <span className="block text-xs">{clip.action}</span>
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <NativeSelect
            size="sm"
            className="w-40"
            aria-label="Location preset"
            value={clip.location_preset_id ?? ""}
            disabled={disabled}
            onChange={(e) =>
              run(() => setClipPresetAction(clip.id, projectId, "location", e.target.value || null))
            }
          >
            <NativeSelectOption value="">No location preset</NativeSelectOption>
            {locations.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            size="sm"
            className="w-40"
            aria-label="Wardrobe preset"
            value={clip.wardrobe_preset_id ?? ""}
            disabled={disabled}
            onChange={(e) =>
              run(() => setClipPresetAction(clip.id, projectId, "wardrobe", e.target.value || null))
            }
          >
            <NativeSelectOption value="">No wardrobe preset</NativeSelectOption>
            {wardrobes.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!current ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">No still prompt yet.</p>
            <Button size="sm" disabled={disabled} onClick={() => run(() => regenerateStillAction(clip.id, projectId))}>
              <Sparkles data-icon="inline-start" /> Generate
            </Button>
          </div>
        ) : editing ? (
          <Textarea
            rows={13}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs"
            aria-label="Still prompt"
          />
        ) : (
          <pre className="rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {current.body}
          </pre>
        )}

        {current ? <WarningList warnings={warnings} /> : null}
        <ErrorNote message={error} />

        {steering ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Steer: closer shot, different angle..."
              aria-label="Steer note"
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && regenerate()}
            />
            <Button size="sm" disabled={disabled} onClick={regenerate}>
              {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Go
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setSteering(false)} aria-label="Cancel">
              <X />
            </Button>
          </div>
        ) : null}

        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button
                  size="sm"
                  disabled={disabled || !draft.trim()}
                  onClick={() => run(() => saveStillAction(clip.id, projectId, draft), () => setEditing(false))}
                >
                  <Check data-icon="inline-start" /> Save as new version
                </Button>
                  <DiscardEditsButton dirty={draft !== current.body} onDiscard={() => setEditing(false)} />
              </>
            ) : (
              <>
                <CopyButton text={current.body} />
                <SavePromptDialog
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                  kind="still"
                  defaultBody={current.body}
                  sourcePromptId={current.id}
                  sampleAsset={
                    sampleAssetId ? { id: sampleAssetId, label: "Use this clip's still as the sample" } : null
                  }
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      <Bookmark data-icon="inline-start" /> Save
                    </Button>
                  }
                />
                <SendToFlowButton projectId={projectId} clipId={clip.id} promptId={current.id} kind="still" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    setDraft(current.body);
                    setEditing(true);
                  }}
                >
                  <Pencil data-icon="inline-start" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => setSteering((v) => !v)}>
                  {pending && !steering ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <RefreshCw data-icon="inline-start" />
                  )}{" "}
                  Regenerate
                </Button>
                <Badge variant="secondary" className="ml-auto">
                  v{current.version}
                </Badge>
              </>
            )}
          </div>
        ) : null}

        {history.length ? (
          <Accordion type="single" collapsible className="text-xs">
            <AccordionItem value="history" className="border-b-0">
              <AccordionTrigger className="py-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <History className="size-3.5" /> {history.length} earlier version{history.length > 1 ? "s" : ""}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <Card size="sm">
                        <CardContent className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">v{h.version}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={disabled}
                              onClick={() => run(() => restorePromptAction(h.id, projectId))}
                            >
                              Restore
                            </Button>
                          </div>
                          <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{h.body}</pre>
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
