"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { toast } from "sonner";
import { enqueueToFlowAction } from "@/app/actions/flow";
import { ErrorNote, useRun } from "@/components/use-run";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Tell the extension (if installed) that the queue changed. Fire and forget. */
function pingExtension() {
  const id = process.env.NEXT_PUBLIC_EXTENSION_ID;
  const chromeApi = (
    globalThis as unknown as {
      chrome?: {
        runtime?: { sendMessage?: (id: string, msg: unknown, cb?: () => void) => void; lastError?: unknown };
      };
    }
  ).chrome;
  if (!id || !chromeApi?.runtime?.sendMessage) return;
  try {
    chromeApi.runtime.sendMessage(id, { type: "queue-updated" }, () => {
      void chromeApi.runtime?.lastError; // swallow "no receiver" errors
    });
  } catch {
    /* extension not installed */
  }
}

function queuedToast(count: number) {
  toast.success(
    count === 0
      ? "Already in the Flow queue"
      : `Queued ${count} prompt${count === 1 ? "" : "s"} for Flow. Open the extension side panel, then press Generate there.`,
  );
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
  const { run, pending, error, setError } = useRun();
  const [sent, setSent] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || disabled}
            onClick={() =>
              run(
                () => enqueueToFlowAction({ projectId, clipIds: [clipId], kind }),
                (res) => {
                  setSent(true);
                  pingExtension();
                  queuedToast((res.data as { queued: number } | undefined)?.queued ?? 1);
                  setTimeout(() => setSent(false), 2500);
                },
              )
            }
          >
            {sent ? <Check data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            {sent ? "Queued" : "Send to Flow"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Adds this prompt to the Chrome extension queue. You still press Generate in Flow.</TooltipContent>
      </Tooltip>
      <ErrorNote message={error} onDismiss={() => setError(null)} />
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
  const { run, pending, error, setError } = useRun();
  const [sent, setSent] = useState<number | null>(null);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            disabled={pending || clipIds.length === 0}
            onClick={() =>
              run(
                () => enqueueToFlowAction({ projectId, clipIds, kind }),
                (res) => {
                  const queued = (res.data as { queued: number } | undefined)?.queued ?? 0;
                  setSent(queued);
                  pingExtension();
                  queuedToast(queued);
                  setTimeout(() => setSent(null), 2500);
                },
              )
            }
          >
            {sent !== null ? <Check data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            {sent !== null ? `Queued ${sent}` : "Send all to Flow"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Queues current prompts. The extension fills Flow; it never presses Generate.</TooltipContent>
      </Tooltip>
      <ErrorNote message={error} onDismiss={() => setError(null)} />
    </>
  );
}
