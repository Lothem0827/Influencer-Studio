"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Sparkles, Upload } from "lucide-react";
import { createProjectFromTrend } from "@/app/actions/extras";
import { ErrorNote } from "@/components/use-run";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ideaFromBreakdown } from "@/lib/prompts/trend";
import type { TrendBreakdown } from "@/lib/schemas";

const FRAME_COUNT = 8;

/** Grab evenly spaced JPEG frames from a local video file, in the browser. */
async function extractFrames(file: File, count: number): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read that video file."));
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the video duration.");
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");

    const frames: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 0.05, (duration * (i + 0.5)) / count);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface AnalyzeResponse {
  breakdown: TrendBreakdown;
  source: { url: string | null; caption: string | null; author: string | null; frames: number };
  limited: string | null;
}

export function TrendTool({ workspaceId, workspaceSlug }: { workspaceId: string; workspaceSlug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"idle" | "analyzing" | "writing">("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function analyze() {
    setError(null);
    setResult(null);
    setBusy("analyzing");
    try {
      const fd = new FormData();
      if (url.trim()) fd.set("url", url.trim());
      if (notes.trim()) fd.set("notes", notes.trim());
      const video = files.find((f) => f.type.startsWith("video/"));
      if (video) {
        const frames = await extractFrames(video, FRAME_COUNT);
        frames.forEach((b, i) => fd.append("frames", new File([b], `frame-${i + 1}.jpg`, { type: "image/jpeg" })));
      } else {
        files.filter((f) => f.type.startsWith("image/")).forEach((f) => fd.append("frames", f));
      }
      const res = await fetch("/api/trends/analyze", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Analysis failed");
      setResult(body as AnalyzeResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy("idle");
    }
  }

  function writeVersion() {
    if (!result) return;
    setBusy("writing");
    setError(null);
    start(async () => {
      const idea = ideaFromBreakdown(result.breakdown, { sourceUrl: result.source.url ?? undefined, notes: notes.trim() || undefined });
      const res = await createProjectFromTrend({
        workspaceId,
        title: `Trend: ${result.breakdown.summary.slice(0, 50)}`,
        idea,
        sourceUrl: result.source.url ?? undefined,
      });
      if (res.projectId) {
        router.push(`/w/${workspaceSlug}/p/${res.projectId}/scripts${res.ok ? "" : `?error=${encodeURIComponent(res.error ?? "")}`}`);
      } else {
        setError(res.error ?? "Could not create the project");
        setBusy("idle");
      }
    });
  }

  const b = result?.breakdown;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="trend-url">TikTok link (optional)</FieldLabel>
              <Input
                id="trend-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@user/video/..."
              />
              <FieldDescription>
                TikTok does not allow downloading, so the link only supplies the public caption and thumbnail.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="trend-files">Video or frames</FieldLabel>
              <Empty
                className="cursor-pointer p-4 hover:bg-muted/40"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setFiles([...e.dataTransfer.files]);
                }}
                role="button"
                tabIndex={0}
                aria-label="Drop a video or screenshots, or click to pick"
                onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  id="trend-files"
                  type="file"
                  multiple
                  accept="video/*,image/*"
                  hidden
                  onChange={(e) => setFiles([...(e.target.files ?? [])])}
                />
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Upload />
                  </EmptyMedia>
                  <EmptyTitle className="text-sm">
                    {files.length ? files.map((f) => f.name).join(", ") : "Drop a video or screenshots, or click to pick"}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
              <FieldDescription>
                {`Save the video yourself and drop it here. ${FRAME_COUNT} frames are extracted in your browser, nothing is uploaded except those frames. You can also drop screenshots.`}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="trend-notes">Notes (optional)</FieldLabel>
              <Textarea
                id="trend-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What do you want to keep or change?"
              />
            </Field>
            <ErrorNote message={error} />
            <div>
              <Button onClick={analyze} disabled={busy !== "idle" || (!url.trim() && !files.length && !notes.trim())}>
                {busy === "analyzing" ? <Spinner data-icon="inline-start" /> : <Clapperboard data-icon="inline-start" />}
                {busy === "analyzing" ? "Analyzing..." : "Break it down"}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {b ? (
        <Card>
          <CardHeader>
            <CardTitle>Motion breakdown</CardTitle>
            <CardAction>
              <span className="text-xs text-muted-foreground">{result?.source.frames} frame(s) analyzed</span>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {result?.limited ? (
              <Alert>
                <AlertDescription>{result.limited}</AlertDescription>
              </Alert>
            ) : null}
            <p>{b.summary}</p>
            <p>
              <span className="font-medium">Hook: </span>
              {b.hook}
            </p>
            <ol className="flex flex-col gap-2">
              {b.beats.map((beat, i) => (
                <li key={i}>
                  <Card size="sm">
                    <CardContent>
                      <p className="text-xs font-medium text-muted-foreground">{beat.time}</p>
                      <p>{beat.what_happens}</p>
                      <p className="text-xs text-muted-foreground">Why it works: {beat.why_it_works}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
            <p>
              <span className="font-medium">Camera: </span>
              {b.camera_notes}
            </p>
            <p>
              <span className="font-medium">Audio: </span>
              {b.audio_notes}
            </p>
            <div>
              <Button onClick={writeVersion} disabled={busy !== "idle"}>
                {busy === "writing" ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                {busy === "writing" ? "Writing scripts..." : "Write my version"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}