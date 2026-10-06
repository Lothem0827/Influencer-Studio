import "server-only";
import { NextResponse } from "next/server";

const FLOW_ORIGINS = ["https://flow.google.com", "https://labs.google"];

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const appOrigin = new URL(req.url).origin;
  if (origin === appOrigin) return origin;
  if (FLOW_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("chrome-extension://")) return origin;
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-extension-token",
    // Chrome Private Network Access: HTTPS page (Flow) calling http://localhost
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(req: Request): Response {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/**
 * Single-user app. Allowed callers:
 *  - the app itself (same origin), or
 *  - the extension, with the shared EXTENSION_API_TOKEN.
 */
export function isAuthorized(req: Request): boolean {
  const token = process.env.EXTENSION_API_TOKEN;
  const sent = req.headers.get("x-extension-token");
  if (token && sent && sent === token) return true;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) return origin === new URL(req.url).origin;
  if (site === "same-origin") return true;
  // Non-browser callers (curl, scripts) only in local dev; production needs the token.
  return process.env.NODE_ENV !== "production" && (site === "none" || site === null);
}

export function json(req: Request, body: unknown, init?: ResponseInit): Response {
  return NextResponse.json(body, { ...init, headers: { ...corsHeaders(req), ...(init?.headers ?? {}) } });
}
