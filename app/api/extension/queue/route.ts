import { isAuthorized, json, preflight } from "@/lib/server/cors";
import { listQueue, listTargets } from "@/lib/server/queue";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return json(req, { error: "Unauthorized" }, { status: 401 });
  try {
    const [items, targets] = await Promise.all([listQueue(), listTargets()]);
    return json(req, { items, targets });
  } catch (e) {
    console.error("[api/extension/queue]", e);
    return json(req, { error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
