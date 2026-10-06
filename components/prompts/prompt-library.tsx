"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSavedPromptAction } from "@/app/actions/saved-prompts";
import { EditSavedPromptForm, SampleMedia, type SavedPromptItem } from "@/components/prompts/save-prompt-dialog";
import { CopyButton } from "@/components/copy-button";
import { ErrorNote, useRun } from "@/components/use-run";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const KIND_LABEL = { still: "Still", video: "Video" } as const;

export function PromptLibrary({ items }: { items: SavedPromptItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const selected = items.find((item) => item.id === openId) ?? null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <Card key={item.id} className="pt-0">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setOpenId(item.id);
              }}
              className="flex w-full flex-col text-left"
            >
              <SampleThumb item={item} />
              <CardHeader>
                <CardTitle className="line-clamp-1">{item.name}</CardTitle>
                <CardDescription className="line-clamp-3">{item.body}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge variant="secondary">{KIND_LABEL[item.kind]}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
              </CardContent>
            </button>
          </Card>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-lg">
          {selected && editing ? (
            <EditSavedPromptForm item={selected} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
          ) : null}
          {selected && !editing ? (
            <PromptDetail item={selected} onEdit={() => setEditing(true)} onDeleted={() => setOpenId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SampleThumb({ item }: { item: SavedPromptItem }) {
  return (
    <div className="flex aspect-video items-center justify-center bg-muted/40">
      {item.sampleUrl && item.sample_kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.sampleUrl} alt="" className="pointer-events-none h-full w-full object-cover object-top" />
      ) : item.sampleUrl && item.sample_kind === "video" ? (
        <video src={item.sampleUrl} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
      ) : (
        <span className="text-xs text-muted-foreground">No sample</span>
      )}
    </div>
  );
}

function PromptDetail({
  item,
  onEdit,
  onDeleted,
}: {
  item: SavedPromptItem;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { run, pending, error } = useRun();

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{item.name}</DialogTitle>
        <DialogDescription>
          {KIND_LABEL[item.kind]} prompt · {new Date(item.created_at).toLocaleDateString()}
        </DialogDescription>
      </DialogHeader>
      <SampleMedia item={item} />
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {item.body}
      </pre>
      <ErrorNote message={error} />
      <DialogFooter>
        <CopyButton text={item.body} label="Copy prompt" />
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="destructive" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
              <AlertDialogDescription>
                {item.name} is removed from the library. The original clip prompt is left as it is.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  run(
                    () => deleteSavedPromptAction(item.id),
                    () => {
                      toast.success("Prompt deleted");
                      onDeleted();
                    },
                  )
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogFooter>
    </div>
  );
}
