"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, History, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import {
  generateVideoPromptAction,
  saveVideoPromptAction,
  setClipStatusAction,
} from "@/app/actions/media";
import { restorePromptAction } from "@/app/actions/wizard";
import { CopyButton } from "@/components/copy-button";
import { SavePromptDialog } from "@/components/prompts/save-prompt-dialog";
import { AssetSlot, type AssetWithUrl } from "@/components/media/asset-slot";
import { SendAllButton, SendToFlowButton } from "@/components/send-to-flow";
import { DiscardEditsButton } from "@/components/confirm-delete";
import { ErrorNote, useRun } from "@/components/use-run";
import { WarningList } from "@/components/wizard/stills-board";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { checkDialogueFits, checkVideoPrompt } from "@/lib/rules";
import type { VariantProps } from "class-variance-authority";
import type { Clip, ClipStatus, IdentityPack, Prompt } from "@/lib/supabase/types";

export const STATUS_META: Record<
  ClipStatus,
  { label: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]> }
> = {
  draft: { label: "Draft", variant: "secondary" },
  still_prompted: { label: "Still prompted", variant: "secondary" },
  imaged: { label: "Image ready", variant: "default" },
  video_prompted: { label: "Video prompted", variant: "default" },
  video_done: { label: "Video done", variant: "success" },
  posted: { label: "Posted", variant: "success" },
};

export function VideosBoard({
  projectId,
  workspaceId,
  workspaceSlug,
  language,
  clips,
  prompts,
  stillPrompts,
  assets,
  identity,
}: {
  projectId: string;
  workspaceId: string;
  workspaceSlug: string;
  language: string;
  clips: Clip[];
  prompts: Prompt[];
  stillPrompts: Prompt[];
  assets: AssetWithUrl[];
  identity: IdentityPack | null;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const router = useRouter();

  const imagesByClip = (clipId: string) => assets.filter((a) => a.clip_id === clipId && a.kind === "image");
  const videosByClip = (clipId: string) => assets.filter((a) => a.clip_id === clipId && a.kind === "video");
  const currentVideoPrompt = (clipId: string) => prompts.find((p) => p.clip_id === clipId && p.is_current);

  const withImage = clips.filter((c) => imagesByClip(c.id).length > 0);
  const missingPrompt = withImage.filter((c) => !currentVideoPrompt(c.id));
  const doneCount = clips.filter((c) => videosByClip(c.id).length > 0).length;

  async function generateMany(targets: Clip[]) {
    setBatchError(null);
    setProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const res = await generateVideoPromptAction(targets[i].id);
      if (!res.ok) {
        setBatchError(`Clip ${targets[i].idx + 1}: ${res.error}`);
        break;
      }
      setProgress({ done: i + 1, total: targets.length });
      router.refresh();
    }
    setProgress(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-semibold">Steps 4 and 5: Images back, then videos back</h2>
          <p className="text-sm text-muted-foreground">
            Add each generated still, get a motion-only video prompt, then bring the finished video back.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            disabled={progress !== null || missingPrompt.length === 0}
            onClick={() => void generateMany(missingPrompt)}
          >
            {progress ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            {progress
              ? `Writing ${progress.done}/${progress.total}...`
              : `Generate video prompts (${missingPrompt.length})`}
          </Button>
          <Button
            variant="outline"
            disabled={progress !== null || withImage.length === 0}
            onClick={() => void generateMany(withImage)}
          >
            <RefreshCw data-icon="inline-start" /> Regenerate all
          </Button>
          <SendAllButton projectId={projectId} kind="video" clipIds={clips.map((c) => c.id)} />
          <Button asChild variant={doneCount === clips.length ? "secondary" : "outline"}>
            <Link href={`/w/${workspaceSlug}/p/${projectId}/finish`}>
              {doneCount === clips.length ? "Finish" : "Finish anyway"}
            </Link>
          </Button>
        </div>
      </div>
      <ErrorNote message={batchError} onDismiss={() => setBatchError(null)} />
      {clips.length > 0 && withImage.length < clips.length ? (
        <Alert variant="warning">
          <AlertTitle>Stills still missing</AlertTitle>
          <AlertDescription>
            Add a still for every clip before writing video prompts. Hover a still slot and paste from Flow, or upload
            a file.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Clip status board */}
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-2">
          {clips.map((c) => {
            const meta = STATUS_META[c.status];
            return (
              <span key={c.id} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs">
                Clip {c.idx + 1}
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </span>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">
            {doneCount}/{clips.length} videos done
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            projectId={projectId}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            language={language}
            images={imagesByClip(clip.id)}
            videos={videosByClip(clip.id)}
            stillPrompt={stillPrompts.find((p) => p.clip_id === clip.id)}
            versions={prompts.filter((p) => p.clip_id === clip.id)}
            identity={identity}
            batchBusy={progress !== null}
          />
        ))}
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  projectId,
  workspaceId,
  workspaceSlug,
  language,
  images,
  videos,
  stillPrompt,
  versions,
  identity,
  batchBusy,
}: {
  clip: Clip;
  projectId: string;
  workspaceId: string;
  workspaceSlug: string;
  language: string;
  images: AssetWithUrl[];
  videos: AssetWithUrl[];
  stillPrompt?: Prompt;
  versions: Prompt[];
  identity: IdentityPack | null;
  batchBusy: boolean;
}) {
  const { run, pending, error } = useRun();
  const current = versions.find((p) => p.is_current) ?? null;
  const history = versions.filter((p) => !p.is_current);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [steering, setSteering] = useState(false);
  const [steer, setSteer] = useState("");
  const disabled = pending || batchBusy;
  const hasImage = images.length > 0;
  const sampleVideo = videos.find((v) => v.is_selected) ?? null;

  const warnings = useMemo(
    () => [
      ...(current
        ? checkVideoPrompt(current.body, { identity, dialogue: clip.dialogue, durationS: clip.duration_s })
        : []),
      ...checkDialogueFits(clip.dialogue, clip.duration_s, language),
    ],
    [current, identity, clip.dialogue, clip.duration_s, language],
  );

  function generate() {
    run(() => generateVideoPromptAction(clip.id, steer || undefined), () => {
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
        <p className="text-sm">&ldquo;{clip.dialogue}&rdquo;</p>
        <CardAction>
          <NativeSelect
            size="sm"
            className="w-40"
            aria-label="Clip status"
            value={clip.status}
            disabled={pending}
            onChange={(e) => run(() => setClipStatusAction(clip.id, e.target.value as ClipStatus))}
          >
            {Object.entries(STATUS_META).map(([k, v]) => (
              <NativeSelectOption key={k} value={k}>
                {v.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[11rem_1fr_11rem]">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Still</p>
          <AssetSlot clipId={clip.id} kind="image" assets={images} />
          {stillPrompt ? (
            <div>
              <CopyButton text={stillPrompt.body} label="Copy still prompt" variant="ghost" />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Video prompt (motion only)</p>
          {!current ? (
            <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                {hasImage ? "Ready to write the video prompt." : "Add the still first. The prompt is written from the image."}
              </p>
              <Button size="sm" disabled={disabled || !hasImage} onClick={generate}>
                <Sparkles data-icon="inline-start" /> Generate
              </Button>
            </div>
          ) : editing ? (
            <Textarea
              rows={16}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs"
              aria-label="Video prompt"
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
                placeholder="Steer: slower push in, more gestures..."
                aria-label="Steer note"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
              />
              <Button size="sm" disabled={disabled} onClick={generate}>
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
                    onClick={() =>
                      run(() => saveVideoPromptAction(clip.id, projectId, draft), () => setEditing(false))
                    }
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
                    kind="video"
                    defaultBody={current.body}
                    sourcePromptId={current.id}
                    sampleAsset={
                      sampleVideo ? { id: sampleVideo.id, label: "Use this clip's video as the sample" } : null
                    }
                    trigger={
                      <Button type="button" size="sm" variant="outline">
                        <Bookmark data-icon="inline-start" /> Save
                      </Button>
                    }
                  />
                  <SendToFlowButton projectId={projectId} clipId={clip.id} promptId={current.id} kind="video" />
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || !hasImage}
                    onClick={() => setSteering((v) => !v)}
                  >
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
                            <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                              {h.body}
                            </pre>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Finished video</p>
          <AssetSlot clipId={clip.id} kind="video" assets={videos} />
        </div>
      </CardContent>
    </Card>
  );
}
