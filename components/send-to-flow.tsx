"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { enqueueToFlowAction } from "@/app/actions/flow";
import { ErrorNote, useRun } from "@/components/use-run";
import { Button } from "@/components/ui/button";

/** Tell the extension (if installed) that the queue changed. Fire and forget. */
function pingExtension() {
  const id = process.env.NEXT_PUBLIC_EXTENSION_ID;
  const chromeApi = (globalThis as unknown as {
    chrome?: { runtime?: { sendMessage?: (id: string, msg: unknown, cb?: () => void) => void; lastError?: unknown } };
  }).chrome;
  if (!id || !chromeApi?.runtime?.sendMessage) return;
  try {
    chromeApi.runtime.sendMessage(id, { type: "queue-updated" }, () => {
      void chromeApi.runtime?.lastError; // swallow "no receiver" errors
    });
  } catch {
    /* extension not installed */
  }
}

export function SendToFlowButton({
  projectId,
  clipId,
  kind,
  disabled,
}: {
  projectId: string;
  clipId: string;
  promptId?: string;
  kind: "still" | "video";
  disabled?: boolean;
}) {
  const { run, pending, error } = useRun();
  const [sent, setSent] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || disabled}
        onClick={() =>
          run(
            () => enqueueToFlowAction({ projectId, clipIds: [clipId], kind }),
            () => {
              setSent(true);
              pingExtension();
              setTimeout(() => setSent(false), 2500);
            },
          )
        }
      >
        {sent ? <Check data-icon="inline-start" /> : <Send data-icon="inline-start" />}
        {sent ? "Queued" : "Send to Flow"}
      </Button>
      <ErrorNote message={error} />
    </>
  );
}

export function SendAllButton({
  projectId,
  clipIds,
  kind,
}: {
  projectId: string;
  clipIds: string[];
  kind: "still" | "video";
}) {
  const { run, pending, error } = useRun();
  const [sent, setSent] = useState<number | null>(null);
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(
            () => enqueueToFlowAction({ projectId, clipIds, kind }),
            (res) => {
              setSent((res.data as { queued: number } | undefined)?.queued ?? 0);
              pingExtension();
              setTimeout(() => setSent(null), 2500);
            },
          )
        }
      >
        {sent !== null ? <Check data-icon="inline-start" /> : <Send data-icon="inline-start" />}
        {sent !== null ? `Queued ${sent}` : "Send all to Flow"}
      </Button>
      <ErrorNote message={error} />
    </>
  );
}
