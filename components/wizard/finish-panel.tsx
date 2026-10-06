"use client";

import { useState } from "react";
import { Download, RefreshCw, Save, Sparkles } from "lucide-react";
import { generateCaptionAction, saveCaptionAction, setProjectTagsAction } from "@/app/actions/extras";
import { CopyButton } from "@/components/copy-button";
import { ErrorNote, useRun } from "@/components/use-run";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Caption } from "@/lib/supabase/types";

export function FinishPanel({
  projectId,
  tags,
  caption,
  clipCount,
  imageCount,
  videoCount,
}: {
  projectId: string;
  tags: string[];
  caption: Caption | null;
  clipCount: number;
  imageCount: number;
  videoCount: number;
}) {
  const { run, pending, error } = useRun();
  const [steer, setSteer] = useState("");
  const [text, setText] = useState(caption?.caption ?? "");
  const [hashtags, setHashtags] = useState((caption?.hashtags ?? []).join(" "));
  const [onScreen, setOnScreen] = useState(caption?.on_screen_text ?? "");
  const [tagText, setTagText] = useState(tags.join(", "));

  const pack = [text, "", hashtags, "", `On-screen text: ${onScreen}`].join("\n");

  function generate() {
    // The page remounts this panel (keyed by caption) when new data arrives.
    run(() => generateCaptionAction(projectId, steer || undefined));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Finish</h2>
        <p className="text-sm text-muted-foreground">
          {imageCount}/{clipCount} stills and {videoCount}/{clipCount} videos attached.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Caption pack</CardTitle>
          <CardAction className="flex gap-2">
            <Input
              className="w-52"
              placeholder="Steer note (optional)"
              aria-label="Steer note"
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
            />
            <Button disabled={pending} onClick={generate}>
              {caption ? (
                <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : ""} />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {caption ? "Regenerate" : "Generate"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cap-text">Caption</FieldLabel>
              <Textarea id="cap-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="cap-hashtags">Hashtags (max 4, niche)</FieldLabel>
                <Input
                  id="cap-hashtags"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#ginhawa #lolo"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cap-onscreen">On-screen text</FieldLabel>
                <Input id="cap-onscreen" value={onScreen} onChange={(e) => setOnScreen(e.target.value)} />
              </Field>
            </FieldGroup>
            <ErrorNote message={error} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    saveCaptionAction(projectId, {
                      caption: text,
                      hashtags,
                      on_screen_text: onScreen,
                    }),
                  )
                }
              >
                <Save data-icon="inline-start" /> Save
              </Button>
              <CopyButton text={pack} label="Copy pack" />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags and export</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cap-tags">Library tags</FieldLabel>
              <div className="flex gap-2">
                <Input id="cap-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} />
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setProjectTagsAction(
                        projectId,
                        tagText.split(",").map((t) => t.trim()),
                      ),
                    )
                  }
                >
                  Save tags
                </Button>
              </div>
              <FieldDescription>Comma separated. Used to filter in the Library.</FieldDescription>
            </Field>
            <Button asChild className="w-fit">
              <a href={`/api/projects/${projectId}/export`}>
                <Download data-icon="inline-start" /> Export ZIP (stills, clips, script.txt, prompts.md)
              </a>
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
