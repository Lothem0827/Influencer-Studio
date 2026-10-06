"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  ImagePlus,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { deleteAssetAction, selectAssetAction } from "@/app/actions/media";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBytes, MAX_UPLOAD_BYTES, pickMatchingFile, validateUpload } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/supabase/types";

export type AssetWithUrl = Asset & { url: string | null };

export function AssetSlot({
  clipId,
  kind,
  assets,
}: {
  clipId: string;
  kind: "image" | "video";
  assets: AssetWithUrl[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const hovered = useRef(false);
  const { run, pending: acting, error: actionError } = useRun();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = assets.find((a) => a.is_selected) ?? assets[0] ?? null;
  const others = assets.filter((a) => a.id !== selected?.id);

  async function upload(file: File, source: "paste" | "upload") {
    const checked = validateUpload(kind, file);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("clip_id", clipId);
      fd.set("kind", kind);
      fd.set("source", source);
      fd.set("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function takeFile(list: FileList | File[] | null, source: "paste" | "upload") {
    if (!list || list.length === 0) return;
    const files = [...list];
    const file = pickMatchingFile(kind, files);
    if (!file) return;
    if (files.length > 1 && !validateUpload(kind, file).ok) {
      setError(`That drop didn’t include a ${kind} file.`);
      return;
    }
    void upload(file, source);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!hovered.current) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, [contenteditable=true]")) return;
      const files = [...(e.clipboardData?.items ?? [])]
        .map((i) => i.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (!files.length) return;
      e.preventDefault();
      takeFile(files, "paste");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const Icon = kind === "image" ? ImagePlus : Video;
  const limit = formatBytes(MAX_UPLOAD_BYTES[kind]);

  return (
    <div className="flex flex-col gap-2">
      <div
        tabIndex={0}
        onMouseEnter={() => {
          hovered.current = true;
        }}
        onMouseLeave={() => {
          hovered.current = false;
        }}
        onFocus={() => {
          hovered.current = true;
        }}
        onBlur={() => {
          hovered.current = false;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          takeFile(e.dataTransfer.files, "upload");
        }}
        className={cn(
          "relative flex aspect-[9/16] max-h-80 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging && "border-primary bg-primary/10",
        )}
      >
        {selected?.url ? (
          kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.url}
              alt="Clip still"
              className="h-full w-full object-contain"
            />
          ) : (
            <video
              src={selected.url}
              controls
              className="h-full w-full object-contain"
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-xs text-muted-foreground">
            <Icon className="size-6" />
            {kind === "image"
              ? "Hover and paste (Ctrl+V), drop, or pick the still from Flow"
              : "Drop or pick the finished video"}
            <span>Up to {limit}</span>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm">
            <Spinner /> Uploading...
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={`${kind}/*`}
          hidden
          onChange={(e) => {
            takeFile(e.target.files, "upload");
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload data-icon="inline-start" /> {selected ? "Replace" : "Upload"}
        </Button>
        {selected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={acting}
                aria-label={`Delete ${kind}`}
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this {kind}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the {kind} from the clip. Other versions stay available.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => run(() => deleteAssetAction(selected.id))}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {selected ? <Badge variant="secondary">{selected.source}</Badge> : null}
        {selected?.flow_url ? (
          <Button asChild size="sm" variant="link">
            <a
              href={selected.flow_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Flow
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        ) : null}
      </div>

      {others.length ? (
        <div className="flex flex-wrap gap-1.5">
          {others.map((a) => (
            <div key={a.id} className="flex items-end gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={acting}
                    onClick={() => run(() => selectAssetAction(a.id))}
                    aria-label="Use this version"
                    className="group relative h-12 w-8 overflow-hidden p-0"
                  >
                    {a.url && kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt="Alternate"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Video className="text-muted-foreground" />
                    )}
                    <span className="absolute inset-0 hidden items-center justify-center bg-background/70 group-hover:flex">
                      <Check className="size-3" />
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Use this version</TooltipContent>
              </Tooltip>
              {a.flow_url ? (
                <Button asChild size="icon-xs" variant="ghost">
                  <a
                    href={a.flow_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open this version in Flow"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <ErrorNote message={error ?? actionError} onDismiss={() => setError(null)} />
    </div>
  );
}
