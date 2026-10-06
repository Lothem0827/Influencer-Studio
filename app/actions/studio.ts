"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/server/supabase";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------- workspaces ---------- */

export async function createWorkspace(fd: FormData) {
  const name = z.string().trim().min(1).parse(str(fd, "name"));
  const slug = slugify(str(fd, "slug") || name);
  if (!slug) throw new Error("Invalid name");
  const ws = must(
    await db()
      .from("workspaces")
      .insert({ name, slug, nickname: str(fd, "nickname") || null, niche: str(fd, "niche") || null })
      .select("id")
      .single(),
    "create workspace",
  ) as { id: string };
  must(await db().from("identity_packs").insert({ workspace_id: ws.id }).select("id").single(), "create identity");
  revalidatePath("/");
  redirect(`/w/${slug}/studio`);
}

export async function saveWorkspaceBasics(fd: FormData) {
  const id = str(fd, "workspace_id");
  const slug = str(fd, "slug");
  must(
    await db()
      .from("workspaces")
      .update({
        name: str(fd, "name").trim() || "Untitled",
        nickname: str(fd, "nickname") || null,
        niche: str(fd, "niche") || null,
      })
      .eq("id", id)
      .select("id")
      .single(),
    "save workspace",
  );
  revalidatePath(`/w/${slug}/studio`);
  revalidatePath("/");
}

/* ---------- identity pack ---------- */

export async function saveIdentity(fd: FormData) {
  const workspaceId = str(fd, "workspace_id");
  const slug = str(fd, "slug");
  const pillars = str(fd, "pillars")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)(?:\s*[:=|]\s*|\s+)(\d+)\s*%?$/);
      return m ? { name: m[1].trim(), weight: Number(m[2]) } : { name: l, weight: 0 };
    });
  const faceRefs = str(fd, "face_ref_urls")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  must(
    await db()
      .from("identity_packs")
      .upsert(
        {
          workspace_id: workspaceId,
          appearance_lock: str(fd, "appearance_lock").trim(),
          wardrobe_dna: str(fd, "wardrobe_dna").trim(),
          palette: str(fd, "palette").trim(),
          voice: str(fd, "voice").trim(),
          banned: str(fd, "banned").trim(),
          pillars,
          face_ref_urls: faceRefs,
          character_sheet_url: str(fd, "character_sheet_url").trim() || null,
        },
        { onConflict: "workspace_id" },
      )
      .select("id")
      .single(),
    "save identity",
  );
  revalidatePath(`/w/${slug}/studio`);
}

/* ---------- house rules ---------- */

export async function saveHouseRule(fd: FormData) {
  const id = str(fd, "id");
  const slug = str(fd, "slug");
  const row = {
    text: str(fd, "text").trim(),
    enabled: fd.get("enabled") === "on",
    sort: Number(str(fd, "sort")) || 0,
  };
  if (!row.text) throw new Error("Rule text is required");
  must(await db().from("house_rules").update(row).eq("id", id).select("id").single(), "save rule");
  revalidatePath(`/w/${slug}/studio`);
}

export async function addHouseRule(fd: FormData) {
  const slug = str(fd, "slug");
  const text = str(fd, "text").trim();
  if (!text) return;
  must(
    await db()
      .from("house_rules")
      .insert({ workspace_id: str(fd, "workspace_id"), text, enabled: true, sort: 1000 })
      .select("id")
      .single(),
    "add rule",
  );
  revalidatePath(`/w/${slug}/studio`);
}

export async function deleteHouseRule(fd: FormData) {
  must(await db().from("house_rules").delete().eq("id", str(fd, "id")).select("id").single(), "delete rule");
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

/* ---------- presets ---------- */

export async function savePreset(fd: FormData) {
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name").trim(),
    body: str(fd, "body").trim(),
    ref_url: str(fd, "ref_url").trim() || null,
  };
  if (!row.name) throw new Error("Preset name is required");
  must(await db().from("presets").update(row).eq("id", id).select("id").single(), "save preset");
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

export async function addPreset(fd: FormData) {
  const kind = z.enum(["location", "wardrobe"]).parse(str(fd, "kind"));
  const name = str(fd, "name").trim();
  if (!name) return;
  must(
    await db()
      .from("presets")
      .insert({ workspace_id: str(fd, "workspace_id"), kind, name, body: str(fd, "body").trim() })
      .select("id")
      .single(),
    "add preset",
  );
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

export async function deletePreset(fd: FormData) {
  must(await db().from("presets").delete().eq("id", str(fd, "id")).select("id").single(), "delete preset");
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

/* ---------- templates ---------- */

export async function saveTemplate(fd: FormData) {
  const id = str(fd, "id");
  const name = str(fd, "name").trim();
  const system_prompt = str(fd, "system_prompt").trim();
  if (!name || !system_prompt) throw new Error("Name and prompt are required");
  must(await db().from("templates").update({ name, system_prompt }).eq("id", id).select("id").single(), "save template");
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

export async function addTemplate(fd: FormData) {
  const step = z.enum(["script", "still", "video", "caption"]).parse(str(fd, "step"));
  const name = str(fd, "name").trim();
  if (!name) return;
  must(
    await db()
      .from("templates")
      .insert({
        workspace_id: str(fd, "workspace_id"),
        step,
        name,
        system_prompt: str(fd, "system_prompt").trim() || "Describe how to write this step.",
        is_default: false,
      })
      .select("id")
      .single(),
    "add template",
  );
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

/** Make a template the default for its step in this workspace (workspace-scoped override). */
export async function setDefaultTemplate(fd: FormData) {
  const id = str(fd, "id");
  const workspaceId = str(fd, "workspace_id");
  const tpl = must(await db().from("templates").select("*").eq("id", id).single(), "template") as {
    id: string;
    workspace_id: string | null;
    step: string;
    name: string;
    system_prompt: string;
  };
  let targetId = id;
  if (tpl.workspace_id === null) {
    // Copy global template into the workspace so the global default is untouched.
    const copy = must(
      await db()
        .from("templates")
        .insert({
          workspace_id: workspaceId,
          step: tpl.step,
          name: tpl.name,
          system_prompt: tpl.system_prompt,
          is_default: false,
        })
        .select("id")
        .single(),
      "copy template",
    ) as { id: string };
    targetId = copy.id;
  }
  must(
    await db().from("templates").update({ is_default: false }).eq("workspace_id", workspaceId).eq("step", tpl.step).select("id"),
    "clear defaults",
  );
  must(await db().from("templates").update({ is_default: true }).eq("id", targetId).select("id").single(), "set default");
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}

export async function deleteTemplate(fd: FormData) {
  must(
    await db().from("templates").delete().eq("id", str(fd, "id")).not("workspace_id", "is", null).select("id").single(),
    "delete template",
  );
  revalidatePath(`/w/${str(fd, "slug")}/studio`);
}
