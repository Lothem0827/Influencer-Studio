"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Res = { ok: boolean; error?: string; data?: unknown };

/** Run a server action, track pending/error state and refresh server data when it succeeds. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    <R extends Res>(fn: () => Promise<R>, onOk?: (res: R) => void) => {
      setError(null);
      start(async () => {
        try {
          const res = await fn();
          if (!res.ok) {
            setError(res.error ?? "Something went wrong");
            return;
          }
          onOk?.(res);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [router],
  );

  return { run, pending, error, setError };
}

export function ErrorNote({
  message,
  onDismiss,
  title = "Couldn’t finish that",
}: {
  message: string | null;
  onDismiss?: () => void;
  title?: string;
}) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onDismiss ? (
        <AlertAction>
          <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss error">
            <X />
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
