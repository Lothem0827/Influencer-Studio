"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a project page in sync with changes made outside it (the Chrome extension uploading
 * from Flow). Polls a tiny endpoint while the tab is visible and refreshes server data on change.
 */
export function LiveRefresh({ projectId, intervalMs = 3000 }: { projectId: string; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/projects/${projectId}/pulse`, { cache: "no-store" });
          if (res.ok) {
            const { version } = (await res.json()) as { version: string };
            if (last.current !== null && last.current !== version) router.refresh();
            last.current = version;
          }
        } catch {
          /* offline or dev server restarting: try again next tick */
        }
      }
      timer = setTimeout(tick, intervalMs);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, intervalMs, router]);

  return null;
}
