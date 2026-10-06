import "server-only";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { db } from "@/lib/server/supabase";

export type LlmProvider = "gemini" | "openai";

export interface LlmImage {
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
}

export interface LlmUsageInfo {
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GenerateOptions {
  /** Used for usage logging, e.g. "script" | "still" | "video" | "caption" */
  step: string;
  projectId?: string | null;
  images?: LlmImage[];
  temperature?: number;
  /** Extra attempts after a parse/validation failure. Default 2. */
  retries?: number;
}

export interface GenerateResult<T> {
  data: T;
  usage: LlmUsageInfo;
}

// USD per 1M tokens (input, output). Estimates only; unknown models cost 0.
const PRICING: Record<string, [number, number]> = {
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.0-flash": [0.1, 0.4],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
};

export function providerFromEnv(): LlmProvider {
  return process.env.LLM_PROVIDER === "openai" ? "openai" : "gemini";
}

export function modelFromEnv(provider: LlmProvider = providerFromEnv()): string {
  return provider === "openai"
    ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
    : (process.env.GEMINI_MODEL ?? "gemini-2.5-flash");
}

function estimateCost(model: string, input: number, output: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (input * p[0] + output * p[1]) / 1_000_000;
}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Provider refused to answer (safety filter). Retrying the same prompt sometimes works; a fallback model usually does. */
class BlockedError extends Error {}

const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";

interface RawCall {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callGemini(
  model: string,
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  opts: GenerateOptions,
): Promise<RawCall> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  // The schema is embedded in the prompt instead of using `responseJsonSchema`:
  // Gemini's classifier intermittently returns PROHIBITED_CONTENT (empty output)
  // for structured-output requests with our system prompts, but not for plain
  // JSON mode. Output is still validated with zod (with retries) by the caller.
  const schemaText = `\n\nReturn ONLY a JSON object (no markdown) that conforms to this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
  const parts: Array<Record<string, unknown>> = [{ text: user + schemaText }];
  for (const img of opts.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      temperature: opts.temperature ?? 0.8,
    },
  } as Parameters<typeof ai.models.generateContent>[0]);
  if (!res.text) {
    const reason = res.candidates?.[0]?.finishReason ?? "unknown";
    const blocked = res.promptFeedback?.blockReason;
    console.warn(`[llm] empty Gemini response (finishReason=${reason}${blocked ? `, blockReason=${blocked}` : ""})`);
    if (blocked) throw new BlockedError(`blocked by Gemini safety filter (${blocked})`);
  }
  return {
    text: res.text ?? "",
    inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
    outputTokens:
      (res.usageMetadata?.candidatesTokenCount ?? 0) +
      (res.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function callOpenAI(
  model: string,
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  opts: GenerateOptions,
): Promise<RawCall> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey });
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: user },
  ];
  for (const img of opts.images ?? []) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    });
  }
  const res = await client.chat.completions.create({
    model,
    temperature: opts.temperature ?? 0.8,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", schema: jsonSchema, strict: false },
    },
  });
  return {
    text: res.choices[0]?.message?.content ?? "",
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

/**
 * Generate JSON validated by a zod schema. Retries on malformed output,
 * feeding the validation error back to the model.
 */
export async function generateJSON<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  opts: GenerateOptions,
): Promise<GenerateResult<z.infer<S>>> {
  const provider = providerFromEnv();
  const model = modelFromEnv(provider);
  const jsonSchema = jsonSchemaFor(schema);
  const maxAttempts = (opts.retries ?? 2) + 1;

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "";
  let blocked = 0;
  let lastWasBlock = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const useFallback = provider === "gemini" && blocked > 0;
    const callModel = useFallback ? GEMINI_FALLBACK_MODEL : model;
    const prompt =
      attempt === 1 || lastWasBlock
        ? user
        : `${user}\n\nYour previous reply was invalid (${lastError}). Reply again with valid JSON only that matches the schema.`;
    let raw: RawCall;
    try {
      raw =
        provider === "openai"
          ? await callOpenAI(callModel, system, prompt, jsonSchema, opts)
          : await callGemini(callModel, system, prompt, jsonSchema, opts);
      lastWasBlock = false;
    } catch (e) {
      if (e instanceof BlockedError) {
        blocked++;
        lastWasBlock = true;
        lastError = e.message;
        continue;
      }
      throw e;
    }
    inputTokens += raw.inputTokens;
    outputTokens += raw.outputTokens;

    try {
      const parsed = schema.safeParse(parseJson(raw.text));
      if (!parsed.success) {
        lastError = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ");
        continue;
      }
      const usage: LlmUsageInfo = {
        provider,
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens),
      };
      await logUsage(opts, usage);
      return { data: parsed.data, usage };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // Count the tokens we burned even when failing.
  await logUsage(opts, {
    provider,
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(model, inputTokens, outputTokens),
  });
  throw new Error(`LLM returned invalid output after ${maxAttempts} attempts: ${lastError}`);
}

async function logUsage(opts: GenerateOptions, usage: LlmUsageInfo) {
  console.info(
    `[llm] ${opts.step} ${usage.provider}/${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(5)}`,
  );
  try {
    await db().from("llm_usage").insert({
      project_id: opts.projectId ?? null,
      step: opts.step,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cost_usd: usage.costUsd,
    });
  } catch (e) {
    console.warn("[llm] failed to log usage", e);
  }
}
