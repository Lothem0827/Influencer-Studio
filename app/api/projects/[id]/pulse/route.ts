import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { isAuthorized, json } from "@/lib/server/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cheap change signal for a project: the page polls this and refreshes itself when it changes
 * (e.g. the extension uploaded an image or video from Flow).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return json(req, { error: "Unauthorized" }, { status: 401 });
  try {
    const id = z.string().uuid().parse((await ctx.params).id);
    const { data: clips, error } = await db().from("clips").select("id,status").eq("project_id", id);
    if (error) throw error;
    const clipIds = (clips ?? []).map((c) => c.id as string);
    let assetSig = "0";
    if (clipIds.length) {
      const { data: assets, error: aErr } = await db()
        .from("assets")
        .select("id,is_selected,created_at")
        .in("clip_id", clipIds);
      if (aErr) throw aErr;
      assetSig = (assets ?? []).map((a) => `${a.id}:${a.is_selected ? 1 : 0}`).sort().join(",");
    }
    const clipSig = (clips ?? []).map((c) => `${c.id}:${c.status}`).sort().join(",");
    return json(req, { version: `${assetSig}|${clipSig}` });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
