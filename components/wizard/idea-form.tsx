"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { startProject } from "@/app/actions/wizard";
import { ErrorNote } from "@/components/use-run";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ASPECT_RATIOS, LANGUAGES, TARGET_MODELS, type TargetModel } from "@/lib/schemas";

export function IdeaForm({
  workspaceId,
  workspaceSlug,
  pillars,
}: {
  workspaceId: string;
  workspaceSlug: string;
  pillars: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [targetModel, setTargetModel] = useState<TargetModel>("veo");
  const [clipSeconds, setClipSeconds] = useState<number>(TARGET_MODELS.veo.clipSeconds);
  const maxClipSeconds = TARGET_MODELS[targetModel].maxClipSeconds;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const clips = String(fd.get("clipCount"));
    const pillar = String(fd.get("pillar"));
    setError(null);
    start(async () => {
      const res = await startProject({
        workspaceId,
        idea: String(fd.get("idea") ?? ""),
        title: String(fd.get("title") ?? "") || undefined,
        targetModel: String(fd.get("targetModel")),
        clipCount: clips === "auto" ? null : Number(clips),
        clipSeconds: Number(fd.get("clipSeconds")),
        language: String(fd.get("language")),
        pillar: pillar || null,
        aspectRatio: String(fd.get("aspectRatio")),
        scriptCount: Number(fd.get("scriptCount")),
      });
      if (res.projectId) {
        // Project exists even if generation failed; the scripts page can retry.
        router.push(`/w/${workspaceSlug}/p/${res.projectId}/scripts${res.ok ? "" : `?error=${encodeURIComponent(res.error ?? "")}`}`);
      } else {
        setError(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="idea">Idea</FieldLabel>
              <Textarea
                id="idea"
                name="idea"
                rows={4}
                required
                placeholder="e.g. A comforting reminder for tired people that resting is not quitting."
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="title">Project title (optional)</FieldLabel>
              <Input
                id="title"
                name="title"
                placeholder="Defaults to the first words of the idea"
                disabled={pending}
              />
            </Field>
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="targetModel">Target video model</FieldLabel>
                <NativeSelect
                  id="targetModel"
                  name="targetModel"
                  value={targetModel}
                  disabled={pending}
                  className="w-full"
                  onChange={(e) => {
                    const next = e.target.value as TargetModel;
                    setTargetModel(next);
                    setClipSeconds(TARGET_MODELS[next].clipSeconds);
                  }}
                >
                  {Object.entries(TARGET_MODELS).map(([k, v]) => (
                    <NativeSelectOption key={k} value={k}>
                      {v.label}, up to {v.maxClipSeconds}s
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="clipSeconds">Seconds per clip</FieldLabel>
                <Input
                  id="clipSeconds"
                  name="clipSeconds"
                  type="number"
                  min={2}
                  max={maxClipSeconds}
                  required
                  value={clipSeconds}
                  disabled={pending}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) {
                      setClipSeconds(2);
                      return;
                    }
                    setClipSeconds(Math.min(Math.max(Math.round(n), 2), maxClipSeconds));
                  }}
                />
                <FieldDescription>
                  {TARGET_MODELS[targetModel].label} cannot go past {maxClipSeconds} seconds.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="clipCount">Number of clips</FieldLabel>
                <NativeSelect id="clipCount" name="clipCount" defaultValue="auto" disabled={pending} className="w-full">
                  <NativeSelectOption value="auto">Auto</NativeSelectOption>
                  {Array.from({ length: 10 }, (_, i) => (
                    <NativeSelectOption key={i + 1} value={i + 1}>
                      {i + 1}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="language">Language</FieldLabel>
                <NativeSelect id="language" name="language" defaultValue="Taglish" disabled={pending} className="w-full">
                  {LANGUAGES.map((l) => (
                    <NativeSelectOption key={l}>{l}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="pillar">Content pillar</FieldLabel>
                <NativeSelect id="pillar" name="pillar" defaultValue="" disabled={pending} className="w-full">
                  <NativeSelectOption value="">None</NativeSelectOption>
                  {pillars.map((p) => (
                    <NativeSelectOption key={p}>{p}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="aspectRatio">Aspect ratio</FieldLabel>
                <NativeSelect id="aspectRatio" name="aspectRatio" defaultValue="9:16" disabled={pending} className="w-full">
                  {ASPECT_RATIOS.map((a) => (
                    <NativeSelectOption key={a}>{a}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="scriptCount">Script options</FieldLabel>
                <NativeSelect id="scriptCount" name="scriptCount" defaultValue="3" disabled={pending} className="w-full">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </FieldGroup>
            <ErrorNote message={error} />
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                {pending ? "Writing scripts..." : "Generate scripts"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
