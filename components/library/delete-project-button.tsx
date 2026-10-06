"use client";

import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions/extras";
import { useRun } from "@/components/use-run";
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
import { Button } from "@/components/ui/button";

export function DeleteProjectButton({ projectId, title }: { projectId: string; title: string }) {
  const { run, pending } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Delete ${title}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the project with all its scripts, prompts and media.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => run(() => deleteProjectAction(projectId))}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
