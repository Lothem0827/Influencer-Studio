"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { savePromptAction, updateSavedPromptAction } from "@/app/actions/saved-prompts";
import { ErrorNote, useRun } from "@/components/use-run";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { validateUpload } from "@/lib/media";
import type { PromptKind, SavedPrompt } from "@/lib/supabase/types";

export type SavedPromptItem = SavedPrompt & { sampleUrl: string | null };

function sampleError(kind: PromptKind, file: File): string | null {
  const mediaKind = kind === "still" ? "image" : "video";
  const res = validateUpload(mediaKind, file);
  if (res.ok) return null;
  return res.error;
}

export function SavePromptDialog({
  workspaceId,
  workspaceSlug,
  kind: initialKind,
  lockKind = true,
  defaultName = "",
  defaultBody = "",
  sourcePromptId,
  sampleAsset,
  trigger,
}: {
  workspaceId: string;
  workspaceSlug: string;
  kind: PromptKind;
  lockKind?: boolean;
  defaultName?: string;
  defaultBody?: string;
  sourcePromptId?: string;
  sampleAsset?: { id: string; label: string } | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-lg">
        {open ? (
          <SavePromptForm
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            kind={initialKind}
            lockKind={lockKind}
            defaultName={defaultName}
            defaultBody={defaultBody}
            sourcePromptId={sourcePromptId}
            sampleAsset={sampleAsset ?? null}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SavePromptForm({
  workspaceId,
  workspaceSlug,
  kind: initialKind,
  lockKind,
  defaultName,
  defaultBody,
  sourcePromptId,
  sampleAsset,
  onDone,
}: {
  workspaceId: string;
  workspaceSlug: string;
  kind: PromptKind;
  lockKind: boolean;
  defaultName: string;
  defaultBody: string;
  sourcePromptId?: string;
  sampleAsset: { id: string; label: string } | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const { run, pending, error, setError } = useRun();
  const [kind, setKind] = useState<PromptKind>(initialKind);
  const [name, setName] = useState(defaultName);
  const [body, setBody] = useState(defaultBody);
  const [useClipSample, setUseClipSample] = useState(Boolean(sampleAsset));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile) {
      const problem = sampleError(kind, file);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (useClipSample && sampleAsset) {
      fd.set("copy_asset_id", sampleAsset.id);
    }
    run(
      () => savePromptAction(fd),
      () => {
        toast.success("Saved to Prompts", {
          action: {
            label: "View",
            onClick: () => router.push(`/w/${workspaceSlug}/prompts`),
          },
        });
        onDone();
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Save prompt</DialogTitle>
        <DialogDescription>
          {lockKind
            ? `Name this ${kind === "still" ? "still" : "video"} prompt and keep an optional sample result.`
            : "Name a prompt and keep an optional sample result."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <input type="hidden" name="workspace_id" value={workspaceId} />
        {sourcePromptId ? <input type="hidden" name="source_prompt_id" value={sourcePromptId} /> : null}
        <Field>
          <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
          <Input
            id={`${uid}-name`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning porch still"
            required
            maxLength={120}
          />
        </Field>
        {lockKind ? (
          <input type="hidden" name="kind" value={kind} />
        ) : (
          <Field>
            <FieldLabel htmlFor={`${uid}-kind`}>Kind</FieldLabel>
            <NativeSelect
              id={`${uid}-kind`}
              name="kind"
              value={kind}
              className="w-full"
              onChange={(e) => setKind(e.target.value as PromptKind)}
            >
              <NativeSelectOption value="still">Still</NativeSelectOption>
              <NativeSelectOption value="video">Video</NativeSelectOption>
            </NativeSelect>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`${uid}-body`}>Prompt</FieldLabel>
          <Textarea
            id={`${uid}-body`}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            required
            className="font-mono text-xs"
            placeholder="Paste the prompt"
          />
        </Field>
        {sampleAsset ? (
          <Field orientation="horizontal">
            <Checkbox
              id={`${uid}-copy`}
              checked={useClipSample}
              onCheckedChange={(v) => setUseClipSample(v === true)}
            />
            <FieldLabel htmlFor={`${uid}-copy`}>{sampleAsset.label}</FieldLabel>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${uid}-file`}>Sample result</FieldLabel>
          <Input id={`${uid}-file`} name="file" type="file" accept={kind === "still" ? "image/*" : "video/*"} />
          <FieldDescription>
            {sampleAsset
              ? "Optional. An uploaded file is used instead of the clip sample."
              : kind === "still"
                ? "Optional image of what this prompt produced."
                : "Optional video of what this prompt produced."}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <ErrorNote message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim() || !body.trim()}>
          {pending ? <Spinner data-icon="inline-start" /> : <Bookmark data-icon="inline-start" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditSavedPromptForm({
  item,
  onCancel,
  onSaved,
}: {
  item: SavedPromptItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const uid = useId();
  const { run, pending, error, setError } = useRun();
  const [name, setName] = useState(item.name);
  const [body, setBody] = useState(item.body);
  const [removeSample, setRemoveSample] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile) {
      const problem = sampleError(item.kind, file);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (removeSample) {
      fd.set("remove_sample", "1");
    }
    run(() => updateSavedPromptAction(fd), () => {
      toast.success("Prompt updated");
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit prompt</DialogTitle>
        <DialogDescription>Update the name, the prompt text, or the sample result.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <input type="hidden" name="id" value={item.id} />
        <Field>
          <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
          <Input
            id={`${uid}-name`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${uid}-body`}>Prompt</FieldLabel>
          <Textarea
            id={`${uid}-body`}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            required
            className="font-mono text-xs"
          />
        </Field>
        {item.sampleUrl ? (
          <Field>
            <FieldLabel>Current sample</FieldLabel>
            <SampleMedia item={item} />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${uid}-file`}>{item.sampleUrl ? "Replace sample" : "Sample result"}</FieldLabel>
          <Input
            id={`${uid}-file`}
            name="file"
            type="file"
            accept={item.kind === "still" ? "image/*" : "video/*"}
            onChange={() => setRemoveSample(false)}
          />
          <FieldDescription>
            {item.kind === "still" ? "Optional image, 20 MB or smaller." : "Optional video, 200 MB or smaller."}
          </FieldDescription>
        </Field>
        {item.sample_path ? (
          <Field orientation="horizontal">
            <Checkbox
              id={`${uid}-remove`}
              checked={removeSample}
              onCheckedChange={(v) => setRemoveSample(v === true)}
            />
            <FieldLabel htmlFor={`${uid}-remove`}>Remove sample</FieldLabel>
          </Field>
        ) : null}
      </FieldGroup>
      <ErrorNote message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim() || !body.trim()}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SampleMedia({ item }: { item: SavedPromptItem }) {
  if (!item.sampleUrl) return null;
  if (item.sample_kind === "video") {
    return <video src={item.sampleUrl} controls className="max-h-64 w-full rounded-lg bg-muted/40" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.sampleUrl} alt="" className="max-h-64 w-full rounded-lg bg-muted/40 object-contain" />
  );
}
