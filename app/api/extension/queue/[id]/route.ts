import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { isAuthorized, json, preflight } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return preflight(req);
}

const Body = z.object({ status: z.enum(["queued", "sent", "done"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return json(req, { error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const { status } = Body.parse(await req.json());
    const { error } = await db().from("send_queue").update({ status }).eq("id", z.string().uuid().parse(id));
    if (error) throw new Error(error.message);
    return json(req, { ok: true });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
