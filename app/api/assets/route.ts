import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { saveAsset } from "@/lib/server/assets";
import { isAuthorized, json, preflight } from "@/lib/server/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS(req: Request) {
  return preflight(req);
}

const Meta = z.object({
  clip_id: z.string().uuid(),
  kind: z.enum(["image", "video"]),
  source: z.enum(["paste", "upload", "extension"]).default("upload"),
  flow_url: z
    .string()
    .url()
    .refine((v) => {
      const u = new URL(v);
      return u.protocol === "https:" && ["flow.google.com", "labs.google"].includes(u.hostname);
    }, "flow_url must be an https Google Flow link")
    .optional(),
  queue_id: z.string().uuid().optional(),
});

/** Multipart upload: fields clip_id, kind, source, flow_url?, queue_id?, file. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return json(req, { error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return json(req, { error: "Missing file" }, { status: 400 });
    }
    const meta = Meta.parse({
      clip_id: form.get("clip_id"),
      kind: form.get("kind"),
      source: form.get("source") ?? undefined,
      flow_url: form.get("flow_url") || undefined,
      queue_id: form.get("queue_id") || undefined,
    });
    const filename = "name" in file && typeof file.name === "string" ? file.name : undefined;
    const asset = await saveAsset({
      clipId: meta.clip_id,
      kind: meta.kind,
      source: meta.source,
      data: await file.arrayBuffer(),
      mimeType: file.type,
      filename,
      flowUrl: meta.flow_url,
    });
    if (meta.queue_id) {
      await db().from("send_queue").update({ status: "done" }).eq("id", meta.queue_id);
    }
    return json(req, { asset });
  } catch (e) {
    console.error("[api/assets]", e);
    const status = e instanceof z.ZodError ? 400 : 500;
    return json(req, { error: e instanceof Error ? e.message : "Upload failed" }, { status });
  }
}
