"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safe, type ActionResult } from "@/lib/server/safe";
import {
  assertSourcePrompt,
  copyAssetSample,
  removeSampleFile,
  uploadSampleFile,
} from "@/lib/server/saved-prompts";
import { db, must } from "@/lib/server/supabase";
import type { AssetKind, PromptKind, SavedPrompt } from "@/lib/supabase/types";

const uuid = z.string().uuid();
const kindSchema = z.enum(["still", "video"]);

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function fileOf(fd: FormData): File | null {
  const v = fd.get("file");
  if (!(v instanceof File) || v.size === 0) return null;
  return v;
}

function readText(fd: FormData) {
  const name = str(fd, "name").trim();
  const body = str(fd, "body").trim();
  if (!name) throw new Error("Name the prompt before saving");
  if (name.length > 120) throw new Error("Name must be 120 characters or fewer");
  if (!body) throw new Error("Prompt text is empty");
  if (body.length > 20_000) throw new Error("Prompt is too long");
  return { name, body };
}

async function loadOwned(id: string): Promise<SavedPrompt> {
  return must(await db().from("saved_prompts").select("*").eq("id", id).single(), "saved prompt") as SavedPrompt;
}

function revalidate() {
  revalidatePath("/w/[ws]/prompts", "page");
}

export async function savePromptAction(fd: FormData): Promise<ActionResult> {
  const res = await safe(async () => {
    const workspaceId = uuid.parse(str(fd, "workspace_id"));
    const { name, body } = readText(fd);
    const kind = kindSchema.parse(str(fd, "kind")) as PromptKind;
    must(await db().from("workspaces").select("id").eq("id", workspaceId).single(), "workspace");

    const sourceRaw = str(fd, "source_prompt_id");
    const sourcePromptId = sourceRaw ? uuid.parse(sourceRaw) : null;
    if (sourcePromptId) await assertSourcePrompt(sourcePromptId, workspaceId);

    const id = randomUUID();
    const file = fileOf(fd);
    const copyId = str(fd, "copy_asset_id");
    let uploaded: { path: string; sampleKind: AssetKind } | null = null;
    try {
      if (file) {
        uploaded = await uploadSampleFile({
          workspaceId,
          savedId: id,
          promptKind: kind,
          data: await file.arrayBuffer(),
          mimeType: file.type,
        });
      } else if (copyId) {
        uploaded = await copyAssetSample({
          workspaceId,
          savedId: id,
          promptKind: kind,
          assetId: uuid.parse(copyId),
        });
      }
      must(
        await db()
          .from("saved_prompts")
          .insert({
            id,
            workspace_id: workspaceId,
            name,
            kind,
            body,
            sample_kind: uploaded?.sampleKind ?? null,
            sample_path: uploaded?.path ?? null,
            source_prompt_id: sourcePromptId,
          })
          .select("id")
          .single(),
        "save prompt",
      );
    } catch (e) {
      if (uploaded) await removeSampleFile(uploaded.sampleKind, uploaded.path);
      throw e;
    }
  });
  revalidate();
  return res;
}

export async function updateSavedPromptAction(fd: FormData): Promise<ActionResult> {
  const res = await safe(async () => {
    const id = uuid.parse(str(fd, "id"));
    const row = await loadOwned(id);
    const { name, body } = readText(fd);
    const file = fileOf(fd);
    const remove = str(fd, "remove_sample") === "1";
    let sampleKind = row.sample_kind;
    let samplePath = row.sample_path;
    let uploaded: { path: string; sampleKind: AssetKind } | null = null;
    try {
      if (file) {
        uploaded = await uploadSampleFile({
          workspaceId: row.workspace_id,
          savedId: id,
          promptKind: row.kind,
          data: await file.arrayBuffer(),
          mimeType: file.type,
        });
        sampleKind = uploaded.sampleKind;
        samplePath = uploaded.path;
      } else if (remove) {
        sampleKind = null;
        samplePath = null;
      }
      must(
        await db()
          .from("saved_prompts")
          .update({ name, body, sample_kind: sampleKind, sample_path: samplePath })
          .eq("id", id)
          .select("id")
          .single(),
        "update prompt",
      );
    } catch (e) {
      if (uploaded) await removeSampleFile(uploaded.sampleKind, uploaded.path);
      throw e;
    }
    if (file && row.sample_path && row.sample_path !== samplePath) {
      await removeSampleFile(row.sample_kind, row.sample_path);
    } else if (remove && !file) {
      await removeSampleFile(row.sample_kind, row.sample_path);
    }
  });
  revalidate();
  return res;
}

export async function deleteSavedPromptAction(id: string): Promise<ActionResult> {
  const res = await safe(async () => {
    const row = await loadOwned(uuid.parse(id));
    must(await db().from("saved_prompts").delete().eq("id", row.id).select("id").single(), "delete prompt");
    await removeSampleFile(row.sample_kind, row.sample_path);
  });
  revalidate();
  return res;
}
