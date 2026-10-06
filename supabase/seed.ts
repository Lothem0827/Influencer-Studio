/**
 * Idempotent seed for the Supabase cloud project.
 *   pnpm db:seed
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_PROJECT,
  GLOBAL_HOUSE_RULES,
  TEMPLATE_SEEDS,
  WORKSPACE_SEEDS,
} from "../lib/prompts/defaults";
import { renderStill } from "../lib/prompts/build";
import type { IdentityPack } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

async function main() {
  // Global house rules (only when none exist)
  const existingGlobal = check(
    await sb.from("house_rules").select("id").is("workspace_id", null),
    "house_rules",
  );
  if (existingGlobal.length === 0) {
    check(
      await sb.from("house_rules").insert(
        GLOBAL_HOUSE_RULES.map((text, sort) => ({ text, sort, enabled: true, workspace_id: null })),
      ),
      "insert global house_rules",
    );
  }

  // Global templates
  for (const t of TEMPLATE_SEEDS.filter((t) => t.workspaceSlug === null)) {
    const found = check(
      await sb.from("templates").select("id").is("workspace_id", null).eq("step", t.step).eq("name", t.name),
      "templates",
    );
    if (found.length === 0) {
      check(
        await sb.from("templates").insert({
          workspace_id: null,
          step: t.step,
          name: t.name,
          system_prompt: t.systemPrompt,
          is_default: t.isDefault,
        }),
        "insert template",
      );
    }
  }

  const slugToId: Record<string, string> = {};

  for (const w of WORKSPACE_SEEDS) {
    let ws = check(
      await sb.from("workspaces").select("id").eq("slug", w.slug).maybeSingle(),
      "workspace",
    ) as { id: string } | null;
    if (!ws) {
      ws = check(
        await sb
          .from("workspaces")
          .insert({ slug: w.slug, name: w.name, nickname: w.nickname, niche: w.niche })
          .select("id")
          .single(),
        "insert workspace",
      ) as { id: string };
      check(
        await sb.from("identity_packs").insert({ workspace_id: ws.id, ...w.identity }),
        "insert identity_pack",
      );
      if (w.houseRules.length) {
        check(
          await sb.from("house_rules").insert(
            w.houseRules.map((text, sort) => ({ workspace_id: ws!.id, text, sort: 100 + sort, enabled: true })),
          ),
          "insert workspace rules",
        );
      }
      check(
        await sb.from("presets").insert(w.presets.map((p) => ({ ...p, workspace_id: ws!.id }))),
        "insert presets",
      );
      for (const t of TEMPLATE_SEEDS.filter((t) => t.workspaceSlug === w.slug)) {
        check(
          await sb.from("templates").insert({
            workspace_id: ws.id,
            step: t.step,
            name: t.name,
            system_prompt: t.systemPrompt,
            is_default: t.isDefault,
          }),
          "insert ws template",
        );
      }
      console.log(`Seeded workspace ${w.name}`);
    }
    slugToId[w.slug] = ws.id;
  }

  // Demo project on Lolo Isko (no LLM needed)
  const wsId = slugToId[DEMO_PROJECT.workspaceSlug];
  const existingDemo = check(
    await sb.from("projects").select("id").eq("workspace_id", wsId).eq("title", DEMO_PROJECT.title),
    "demo project",
  );
  if (existingDemo.length === 0) {
    const project = check(
      await sb
        .from("projects")
        .insert({
          workspace_id: wsId,
          title: DEMO_PROJECT.title,
          idea: DEMO_PROJECT.idea,
          target_model: DEMO_PROJECT.targetModel,
          language: DEMO_PROJECT.language,
          pillar: DEMO_PROJECT.pillar,
          aspect_ratio: DEMO_PROJECT.aspectRatio,
          status: "stills",
        })
        .select("id")
        .single(),
      "insert project",
    ) as { id: string };

    const script = check(
      await sb
        .from("scripts")
        .insert({
          project_id: project.id,
          title: DEMO_PROJECT.script.title,
          hook: DEMO_PROJECT.script.hook,
          body: { clips: DEMO_PROJECT.script.clips },
          is_picked: true,
        })
        .select("id")
        .single(),
      "insert script",
    ) as { id: string };
    check(await sb.from("projects").update({ picked_script_id: script.id }).eq("id", project.id), "pick script");

    const presets = check(await sb.from("presets").select("id,kind,name").eq("workspace_id", wsId), "presets") as {
      id: string;
      kind: string;
      name: string;
    }[];
    const loc = presets.find((p) => p.kind === "location");
    const ward = presets.find((p) => p.kind === "wardrobe");

    const clips = check(
      await sb
        .from("clips")
        .insert(
          DEMO_PROJECT.script.clips.map((c, idx) => ({
            project_id: project.id,
            script_id: script.id,
            idx,
            dialogue: c.dialogue,
            action: c.action,
            duration_s: c.duration_s,
            location_preset_id: loc?.id ?? null,
            wardrobe_preset_id: ward?.id ?? null,
            status: "still_prompted",
          })),
        )
        .select("id,idx"),
      "insert clips",
    ) as { id: string; idx: number }[];

    const identity = check(
      await sb.from("identity_packs").select("*").eq("workspace_id", wsId).single(),
      "identity",
    ) as IdentityPack;

    const angles = ["Medium close-up, chest-up, front, eye-level, static tripod", "Medium, waist-up, 3/4 from camera-left, static tripod"];
    for (const c of clips) {
      const body = renderStill(identity, {
        subject: "Closed mouth, about to speak, calm warm expression, direct eye contact with the lens.",
        pose: "Seated on the papag, relaxed shoulders, hands resting loosely on his knees.",
        wardrobe: "Off-white camisa de chino, slightly worn cotton, top button open.",
        setting: "Outdoor yard with a bamboo papag, banana leaves behind, a few chickens far in the background.",
        style: "Photoreal, natural camera realism, slight film grain.",
        color: "Warm earth tones, off-white, soft greens.",
        lighting: "Warm golden-hour light from camera-right, soft shadows.",
        camera: angles[c.idx % angles.length],
        aspect_ratio: "9:16",
        visible_text: "",
      });
      check(await sb.from("prompts").insert({ clip_id: c.id, kind: "still", body, is_current: true }), "insert prompt");
    }
    console.log("Seeded demo project");
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
