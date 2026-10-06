"use client";

import type { ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
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

/** Confirm a destructive server-action form before it submits. */
export function ConfirmDeleteForm({
  action,
  title,
  description,
  confirmLabel = "Delete",
  trigger,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  trigger: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton variant="destructive">{confirmLabel}</SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Confirm discarding unsaved in-place edits. */
export function DiscardEditsButton({
  dirty,
  onDiscard,
  disabled,
}: {
  dirty: boolean;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  if (!dirty) {
    return (
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onDiscard}>
        Cancel
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard edits?</AlertDialogTitle>
          <AlertDialogDescription>Your unsaved changes on this card will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
