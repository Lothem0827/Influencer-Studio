"use server";

import { z } from "zod";
import { db, must } from "@/lib/server/supabase";
import { safe, type ActionResult } from "@/lib/server/safe";
import type { Asset, Prompt } from "@/lib/supabase/types";

/** Queue current prompts for the Chrome extension. Never triggers generation. */
export async function enqueueToFlowAction(input: {
  projectId: string;
  clipIds: string[];
  kind: "still" | "video";
}): Promise<ActionResult<{ queued: number }>> {
  return safe(async () => {
    const { clipIds, kind } = z
      .object({
        projectId: z.string().uuid(),
        clipIds: z.array(z.string().uuid()).min(1),
        kind: z.enum(["still", "video"]),
      })
      .parse(input);

    const prompts = must(
      await db().from("prompts").select("*").in("clip_id", clipIds).eq("kind", kind).eq("is_current", true),
      "prompts",
    ) as Prompt[];
    if (!prompts.length) throw new Error(`No ${kind} prompts to send yet.`);

    const existing = must(
      await db().from("send_queue").select("prompt_id").in("prompt_id", prompts.map((p) => p.id)).eq("status", "queued"),
      "queue",
    ) as { prompt_id: string }[];
    const already = new Set(existing.map((e) => e.prompt_id));

    // Video prompts travel with the clip's selected still.
    const imageByClip = new Map<string, string>();
    if (kind === "video") {
      const assets = must(
        await db()
          .from("assets")
          .select("*")
          .in("clip_id", clipIds)
          .eq("kind", "image")
          .eq("is_selected", true)
          .order("created_at", { ascending: false }),
        "assets",
      ) as Asset[];
      for (const a of assets) if (!imageByClip.has(a.clip_id)) imageByClip.set(a.clip_id, a.id);
    }

    const rows = prompts
      .filter((p) => !already.has(p.id))
      .map((p) => ({
        prompt_id: p.id,
        clip_id: p.clip_id,
        ref_asset_id: imageByClip.get(p.clip_id) ?? null,
        status: "queued",
      }));
    if (rows.length) must(await db().from("send_queue").insert(rows).select("id"), "enqueue");
    return { queued: rows.length + already.size };
  });
}
