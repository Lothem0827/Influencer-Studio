# Influencer Studio — Build Plan

A local-first web app + Chrome extension for running AI influencer content (Lolo Isko, Iska, and future characters).
The app **only writes text** (scripts, still prompts, video prompts) with a cheap LLM. All image/video generation happens in **Google Flow**, where the user presses Generate manually. No image/video APIs.

---

## 1. Goals

- One idea in → script options → per-clip still prompts → images back → per-clip video prompts → videos back.
- Every prompt automatically respects the character's identity pack and house rules.
- Everything (ideas, scripts, prompts, images, videos) is saved per influencer workspace.
- Step-by-step wizard UX (not a node canvas). Any single piece can be edited or regenerated without redoing the rest.

## 2. Non-goals (v1)

- No paid image/video generation APIs.
- No auto-clicking "Generate" in Google Flow (user always clicks it).
- No auto-posting to TikTok.
- No multi-user/team accounts (single user, but keep auth-ready).

---

## 3. Tech stack

| Layer           | Choice                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App             | Next.js 15 (App Router), TypeScript, React Server Components + server actions                                                                          |
| UI              | Tailwind CSS + shadcn/ui, lucide-react icons                                                                                                           |
| State (client)  | Zustand for wizard state; TanStack Query for server data                                                                                               |
| DB + storage    | Supabase (Postgres + Storage buckets for images/videos). Local dev via Supabase CLI                                                                    |
| LLM             | Provider-agnostic wrapper (`lib/llm.ts`) — default OpenAI `gpt-4o-mini` or Gemini Flash; key in `.env.local`. Use structured JSON output (zod schemas) |
| Validation      | zod                                                                                                                                                    |
| Extension       | Chrome Manifest V3, side panel, TypeScript, built with Vite (`/extension` folder in same repo)                                                         |
| Package manager | pnpm                                                                                                                                                   |

Repo layout:

```
/app            Next.js routes
/components     UI components
/lib            llm.ts, prompts/, schemas/, supabase/, rules/
/extension      Chrome MV3 extension (Vite)
/supabase       migrations + seed
plan.md
```

---

## 4. Core wizard (per project)

### Step 1 — Idea

- Pick influencer workspace (Lolo Isko / Iska / …).
- Text box: one idea prompt.
- Options: target video model (`veo` ≈ 8s/clip, `seedance` / `kling` ≈ 15s/clip), number of clips (auto or 1–10), language (Taglish / English / Tagalog), content pillar (from workspace pillars), aspect ratio (default 9:16).
- Button: **Generate scripts**.

### Step 2 — Scripts

- Choose how many options (1–5, default 3).
- Each script = card with title, hook, and clips (each clip: dialogue line, action/beat, duration).
- Per card: **Edit** (inline), **Regenerate** (with optional steer note, e.g. "funnier", "shorter"), **Pick**.
- Global: **Regenerate all**.
- Dialogue length checked against clip duration (approx. words/sec per language).
- Picking a script locks it into the project and moves to Step 3.

### Step 3 — Still prompts

- One card per clip with a still prompt in the **AI realism format** (exact label order, plain `Label:` lines):
  ```
  Subject:
  Pose:
  Wardrobe:
  Setting:
  Style:
  Color:
  Lighting:
  Camera:
  Aspect ratio:
  Visible text:   (only if text exists)
  ```
- Identity lock, wardrobe DNA, location preset and house rules injected automatically.
- Per card: **Copy**, **Send to Flow** (via extension), **Edit**, **Regenerate**. Global: **Send all**.
- Shot checker runs on every card (see §7).

### Step 4 — Images back → video prompts

- Each clip card has an image slot. Fill by: paste (Ctrl+V), drag-drop, file pick, or **extension "Use this"** button inside Flow.
- Images upload to Supabase Storage and attach to the clip.
- **Generate video prompt** per clip (or all): LLM gets image (vision model) + script line + clip duration + house rules → returns a **motion-only** I2V prompt (camera move + subject micro-motion + timed speaking hand gestures; no re-describing appearance).
- Per card: Copy / Send to Flow / Edit / Regenerate.

### Step 5 — Video back

- Send video prompt (+ attached still) to Flow via extension.
- Extension **"Use this"** on a finished Flow video → uploads/links to the clip. Or manual upload.
- Clip status moves to `video_done`.

### Finish

- Caption pack (caption, ≤4 niche hashtags, on-screen text, AI-content label).
- Export ZIP (stills, clips, script.txt, prompts.md).

---

## 5. Influencer Studio (workspaces)

- **Workspace** per influencer: name, nickname, niche, avatar.
- **Identity pack**: face reference image(s), character sheet image, appearance lock text (word-for-word, injected into Subject), wardrobe DNA, palette, voice/personality, banned items, content pillars with target mix (e.g. 70/20/10).
- **House rules** (editable list, injected into system prompts). Seed defaults:
  - Handheld selfie: camera-holding hand's palm/wrist not visible; frame only after the wrist (forearm toward elbow); phone not visible.
  - Talking clips: natural speaker-style hand gestures timed to dialogue; never frozen arms.
  - Next clip in a pack keeps the same environment unless changed.
- **Location presets** and **wardrobe presets** (name + text block + optional ref image).
- **Prompt templates** (editable system prompts per step), seeded from the user's skills: AI realism prompt, I2V motion template, Lolo Isko pack, drama series.
- **Library**: all projects, scripts, prompts, images, videos — search + filter by pillar/tag/status.

---

## 6. Data model (Supabase)

```
workspaces(id, name, nickname, niche, avatar_url, created_at)
identity_packs(id, workspace_id, appearance_lock, wardrobe_dna, palette, voice, banned, pillars jsonb, face_ref_urls text[], character_sheet_url)
house_rules(id, workspace_id null=global, text, enabled, sort)
presets(id, workspace_id, kind enum('location','wardrobe'), name, body, ref_url)
templates(id, workspace_id null=global, step enum('script','still','video','caption'), name, system_prompt, is_default)
projects(id, workspace_id, title, idea, target_model, language, pillar, aspect_ratio, status, picked_script_id, created_at)
scripts(id, project_id, title, hook, body jsonb, steer_note, version, parent_id, is_picked)
clips(id, project_id, script_id, idx, dialogue, action, duration_s, location_preset_id, wardrobe_preset_id, status enum('draft','still_prompted','imaged','video_prompted','video_done','posted'))
prompts(id, clip_id, kind enum('still','video'), body, version, parent_id, is_current, checker jsonb)
assets(id, clip_id, kind enum('image','video'), storage_path, source enum('paste','upload','extension'), flow_url, is_selected, created_at)
captions(id, project_id, caption, hashtags text[], on_screen_text, ai_label)
send_queue(id, prompt_id, asset_ref_url, status enum('queued','sent','done'), created_at)
```

- Every regenerate creates a new version row (`parent_id`), old ones kept → version history UI.

---

## 7. Rules engine / shot checker (`lib/rules/`)

Pure functions run on each prompt; show warnings on the card:

- Still prompt has all labels in exact order; `Visible text` only if text present.
- Selfie shots mention no palm / after-wrist framing.
- Wardrobe matches identity pack DNA (warn on banned items/colors).
- Video prompt is motion-only (warn if it re-describes face/outfit).
- Talking clip includes hand gestures.
- Dialogue word count fits clip duration.

---

## 8. LLM layer

- `lib/llm.ts`: `generateJSON<T>(schema, system, user, opts)` with provider switch (env `LLM_PROVIDER`), retries, token logging.
- `lib/prompts/`: builders that compose system prompt = template + identity pack + house rules + presets.
- zod schemas: `ScriptOptions`, `StillPrompt`, `VideoPrompt`, `CaptionPack`.
- Vision call for Step 4 (image → video prompt).
- Show estimated token cost per run in a small footer.

---

## 9. Chrome extension (`/extension`)

- MV3, **side panel** on `labs.google/fx/tools/flow*`.
- App ↔ extension messaging: `externally_connectable` (app origin `http://localhost:3000` + prod domain) + `chrome.runtime.sendMessage(EXTENSION_ID, …)`. Fallback: app polls/side panel reads `send_queue` from Supabase.
- Side panel shows queued prompts (project, clip #, kind). For each:
  - **Fill**: paste prompt into Flow's prompt box, set 9:16, select Image/Video mode, attach character sheet / clip still if provided.
  - User clicks Flow's own Generate.
- **Use this** button injected on Flow result tiles (content script) → fetch the media blob → upload to app API (`POST /api/assets`) with `clip_id`.
- All Flow DOM selectors in one file (`extension/src/flow-selectors.ts`) so UI changes are a one-file fix.
- Never auto-click Generate; never scrape cookies/tokens.

---

## 10. Routes / screens

```
/                         Workspace picker
/w/[ws]                   Workspace dashboard (recent projects, pillar mix)
/w/[ws]/studio            Identity pack, house rules, presets, templates
/w/[ws]/library           Library (search/filter)
/w/[ws]/new               Wizard Step 1
/w/[ws]/p/[id]/scripts    Step 2
/w/[ws]/p/[id]/stills     Step 3
/w/[ws]/p/[id]/videos     Step 4–5
/w/[ws]/p/[id]/finish     Caption pack + export
/api/llm/*                Server routes for generation
/api/assets               Asset upload (used by extension)
```

Wizard has a top stepper; user can jump back to any completed step.

---

## 11. Phases & acceptance criteria

### Phase 1 — Wizard steps 1–3 + workspaces (MVP)

- [ ] Next.js + Supabase scaffold, migrations, seed Lolo Isko + Iska workspaces with identity packs and house rules.
- [ ] Studio page: edit identity pack, house rules, presets, templates.
- [ ] Step 1 idea form; Step 2 script options (count, edit, regenerate one/all with steer note, pick).
- [ ] Step 3 still prompts in exact AI-realism label format, Copy buttons, edit/regenerate, version history.
- [ ] Shot checker warnings.
- **Done when:** from one idea, user gets 3 scripts, picks one, and copies correct still prompts for every clip; everything persists after reload.

### Phase 2 — Images back + video prompts

- [ ] Paste/drag/upload image per clip → Storage.
- [ ] Vision-based motion-only video prompt per clip, Copy/edit/regenerate.
- [ ] Clip status board.
- **Done when:** user pastes stills for all clips and gets a video prompt per clip.

### Phase 3 — Chrome extension

- [ ] Side panel queue, Fill prompt into Flow, set 9:16, attach image.
- [ ] "Use this" on Flow results → uploads to correct clip.
- [ ] Send to Flow / Send all buttons in app.
- **Done when:** full loop runs app → Flow → app → Flow without manual copy/paste or downloads.

### Phase 4 — Studio extras

- [ ] Caption pack + export ZIP.
- [ ] Library search/filter/tags.
- [ ] Content calendar with pillar mix.
- [ ] Trend → script: paste TikTok link, get a motion breakdown (download, frames, beats) and a version in the influencer's style.
- [ ] Performance log (views/likes per post) and simple "what's working" view.

---

## 12. Conventions for Cursor

- TypeScript strict; zod at every API boundary.
- Server-only code in `lib/server/*`; never expose LLM keys to client.
- Keep prompt text in `lib/prompts/*.ts` (not inline in components).
- Small, composable components; shadcn/ui primitives.
- Each phase ends with a working `pnpm dev` and seeded demo project.
- `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_EXTENSION_ID`.

Start with **Phase 1**.
