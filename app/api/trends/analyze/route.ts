import { z } from "zod";
import { generateJSON } from "@/lib/llm";
import { TrendBreakdown } from "@/lib/schemas";
import { TREND_SYSTEM, trendUserPrompt } from "@/lib/prompts/trend";
import { isAuthorized } from "@/lib/server/cors";

export const runtime = "nodejs";
export const maxDuration = 120;

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/** Public caption/author/thumbnail for a TikTok link. Videos themselves are not downloaded. */
async function tiktokOEmbed(url: string): Promise<OEmbed | null> {
  if (!/^https?:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(url)) return null;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? ((await res.json()) as OEmbed) : null;
  } catch {
    return null;
  }
}

async function urlToImage(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return { mimeType: type, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const url = z.string().trim().optional().parse(form.get("url")?.toString() || undefined);
    const notes = form.get("notes")?.toString().trim() || undefined;
    const frames = form.getAll("frames").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 12);

    const meta = url ? await tiktokOEmbed(url) : null;

    const images = await Promise.all(
      frames.map(async (f) => ({
        mimeType: f.type || "image/jpeg",
        data: Buffer.from(await f.arrayBuffer()).toString("base64"),
      })),
    );
    // No frames uploaded: fall back to the link's public thumbnail so there is at least one image.
    if (!images.length && meta?.thumbnail_url) {
      const thumb = await urlToImage(meta.thumbnail_url);
      if (thumb) images.push(thumb);
    }
    if (!images.length && !meta?.title && !notes) {
      return Response.json(
        { error: "Nothing to analyze. Drop the video (or frames) here. TikTok links alone only give a caption and thumbnail." },
        { status: 400 },
      );
    }

    const { data, usage } = await generateJSON(
      TrendBreakdown,
      TREND_SYSTEM,
      trendUserPrompt({ frameCount: images.length, caption: meta?.title, author: meta?.author_name, notes }),
      { step: "trend", images, temperature: 0.4 },
    );
    return Response.json({
      breakdown: data,
      source: { url: url ?? null, caption: meta?.title ?? null, author: meta?.author_name ?? null, frames: images.length },
      cost: usage.costUsd,
      limited: images.length <= 1 ? "Only one image was available, so beats are inferred from the caption and notes." : null,
    });
  } catch (e) {
    console.error("[api/trends/analyze]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}
