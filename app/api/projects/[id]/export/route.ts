import { z } from "zod";
import { buildProjectZip } from "@/lib/server/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { buffer, name } = await buildProjectZip(z.string().uuid().parse(id));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
