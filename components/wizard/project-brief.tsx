"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateProjectBriefAction } from "@/app/actions/wizard";
import { ErrorNote, useRun } from "@/components/use-run";
import { Button } from "@/components/ui/button";
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

export function ProjectBrief({
  projectId,
  title,
  idea,
  pillar,
  pillars,
  language,
  targetModel,
  aspectRatio,
}: {
  projectId: string;
  title: string;
  idea: string;
  pillar: string | null;
  pillars: string[];
  language: string;
  targetModel: string;
  aspectRatio: string;
}) {
  const { run, pending, error } = useRun();
  const [open, setOpen] = useState(false);
  const [nextTitle, setNextTitle] = useState(title);
  const [nextIdea, setNextIdea] = useState(idea);
  const [nextPillar, setNextPillar] = useState(pillar ?? "");

  function openDialog() {
    setNextTitle(title);
    setNextIdea(idea);
    setNextPillar(pillar ?? "");
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" onClick={openDialog} aria-label="Edit project details">
          <Pencil data-icon="inline-start" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project details</DialogTitle>
          <DialogDescription>
            {language} · {targetModel} · {aspectRatio}. Changing the idea does not rewrite existing scripts until you
            regenerate them.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="brief-title">Title</FieldLabel>
            <Input id="brief-title" value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="brief-idea">Idea</FieldLabel>
            <Textarea id="brief-idea" rows={4} value={nextIdea} onChange={(e) => setNextIdea(e.target.value)} />
            <FieldDescription>Used the next time you generate or regenerate scripts.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="brief-pillar">Content pillar</FieldLabel>
            <NativeSelect
              id="brief-pillar"
              className="w-full"
              value={nextPillar}
              onChange={(e) => setNextPillar(e.target.value)}
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {pillars.map((p) => (
                <NativeSelectOption key={p}>{p}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <ErrorNote message={error} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            disabled={pending || nextIdea.trim().length < 3}
            onClick={() =>
              run(
                () =>
                  updateProjectBriefAction({
                    projectId,
                    title: nextTitle,
                    idea: nextIdea,
                    pillar: nextPillar || null,
                  }),
                () => setOpen(false),
              )
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
