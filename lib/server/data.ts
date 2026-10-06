import "server-only";
import { db, must } from "@/lib/server/supabase";
import { FALLBACK_TEMPLATE } from "@/lib/prompts/defaults";
import type { PromptContext } from "@/lib/prompts/build";
import type {
  Asset,
  Clip,
  HouseRule,
  IdentityPack,
  Preset,
  Project,
  Prompt,
  Script,
  Template,
  TemplateStep,
  Workspace,
} from "@/lib/supabase/types";

export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/* ---------- workspaces ---------- */

export async function listWorkspaces(): Promise<Workspace[]> {
  return must(await db().from("workspaces").select("*").order("created_at"), "list workspaces");
}

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const { data, error } = await db().from("workspaces").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`workspace: ${error.message}`);
  return data as Workspace | null;
}

export async function getWorkspaceById(id: string): Promise<Workspace> {
  return must(await db().from("workspaces").select("*").eq("id", id).single(), "workspace");
}

export async function getIdentity(workspaceId: string): Promise<IdentityPack | null> {
  const { data, error } = await db().from("identity_packs").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(`identity: ${error.message}`);
  return data as IdentityPack | null;
}

export async function getHouseRules(workspaceId: string): Promise<HouseRule[]> {
  const rows = must(
    await db()
      .from("house_rules")
      .select("*")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("sort"),
    "house rules",
  );
  return rows as HouseRule[];
}

export async function getPresets(workspaceId: string): Promise<Preset[]> {
  return must(await db().from("presets").select("*").eq("workspace_id", workspaceId).order("name"), "presets");
}

export async function getTemplates(workspaceId: string): Promise<Template[]> {
  const rows = must(
    await db()
      .from("templates")
      .select("*")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("step")
      .order("name"),
    "templates",
  );
  return rows as Template[];
}

/** Workspace default > global default > code fallback. */
export async function resolveTemplate(workspaceId: string, step: TemplateStep): Promise<string> {
  const all = (await getTemplates(workspaceId)).filter((t) => t.step === step && t.is_default);
  const ws = all.find((t) => t.workspace_id === workspaceId);
  const global = all.find((t) => t.workspace_id === null);
  return (ws ?? global)?.system_prompt ?? FALLBACK_TEMPLATE[step];
}

export async function getPromptContext(workspaceId: string): Promise<PromptContext> {
  const [workspace, identity, houseRules] = await Promise.all([
    getWorkspaceById(workspaceId),
    getIdentity(workspaceId),
    getHouseRules(workspaceId),
  ]);
  return { workspace, identity, houseRules };
}

/* ---------- projects ---------- */

export async function listProjects(workspaceId: string): Promise<Project[]> {
  return must(
    await db().from("projects").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    "projects",
  );
}

export async function getProject(id: string): Promise<Project> {
  return must(await db().from("projects").select("*").eq("id", id).single(), "project");
}

export async function getScripts(projectId: string): Promise<Script[]> {
  return must(
    await db().from("scripts").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    "scripts",
  );
}

export async function getClips(projectId: string, scriptId?: string | null): Promise<Clip[]> {
  let q = db().from("clips").select("*").eq("project_id", projectId);
  if (scriptId) q = q.eq("script_id", scriptId);
  return must(await q.order("idx"), "clips");
}

/** All prompt versions for the clips, newest first. */
export async function getPrompts(clipIds: string[]): Promise<Prompt[]> {
  if (!clipIds.length) return [];
  return must(
    await db().from("prompts").select("*").in("clip_id", clipIds).order("version", { ascending: false }),
    "prompts",
  );
}

export async function getAssets(clipIds: string[]): Promise<Asset[]> {
  if (!clipIds.length) return [];
  return must(
    await db().from("assets").select("*").in("clip_id", clipIds).order("created_at", { ascending: false }),
    "assets",
  );
}

/* ---------- storage ---------- */

export function bucketFor(kind: "image" | "video"): string {
  return kind === "image" ? "images" : "videos";
}

export async function signedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await db().storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function signAssets(assets: Asset[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    assets.map(async (a) => {
      const url = await signedUrl(bucketFor(a.kind), a.storage_path);
      if (url) out[a.id] = url;
    }),
  );
  return out;
}

/* ---------- usage ---------- */

export async function projectUsage(projectId: string): Promise<{ input: number; output: number; cost: number }> {
  const rows = must(
    await db().from("llm_usage").select("input_tokens,output_tokens,cost_usd").eq("project_id", projectId),
    "usage",
  ) as { input_tokens: number; output_tokens: number; cost_usd: number }[];
  return rows.reduce(
    (acc, r) => ({
      input: acc.input + r.input_tokens,
      output: acc.output + r.output_tokens,
      cost: acc.cost + Number(r.cost_usd),
    }),
    { input: 0, output: 0, cost: 0 },
  );
}
