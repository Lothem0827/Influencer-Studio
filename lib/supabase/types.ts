// Hand-written row types mirroring supabase/migrations. Keep in sync with the SQL.

export type PresetKind = "location" | "wardrobe";
export type TemplateStep = "script" | "still" | "video" | "caption";
export type ClipStatus =
  | "draft"
  | "still_prompted"
  | "imaged"
  | "video_prompted"
  | "video_done"
  | "posted";
export type PromptKind = "still" | "video";
export type AssetKind = "image" | "video";
export type AssetSource = "paste" | "upload" | "extension";
export type QueueStatus = "queued" | "sent" | "done";
export type ProjectStatus = "idea" | "scripts" | "stills" | "videos" | "finished";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  nickname: string | null;
  niche: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Pillar {
  name: string;
  weight: number;
}

export interface IdentityPack {
  id: string;
  workspace_id: string;
  appearance_lock: string;
  wardrobe_dna: string;
  palette: string;
  voice: string;
  banned: string;
  pillars: Pillar[];
  face_ref_urls: string[];
  character_sheet_url: string | null;
}

export interface HouseRule {
  id: string;
  workspace_id: string | null;
  text: string;
  enabled: boolean;
  sort: number;
}

export interface Preset {
  id: string;
  workspace_id: string;
  kind: PresetKind;
  name: string;
  body: string;
  ref_url: string | null;
}

export interface Template {
  id: string;
  workspace_id: string | null;
  step: TemplateStep;
  name: string;
  system_prompt: string;
  is_default: boolean;
}

export interface Project {
  id: string;
  workspace_id: string;
  title: string;
  idea: string;
  target_model: string;
  language: string;
  pillar: string | null;
  aspect_ratio: string;
  clip_count: number | null;
  clip_seconds: number;
  status: ProjectStatus;
  picked_script_id: string | null;
  tags: string[];
  created_at: string;
}

export interface ScriptClip {
  dialogue: string;
  action: string;
  duration_s: number;
}

export interface ScriptBody {
  clips: ScriptClip[];
}

export interface Script {
  id: string;
  project_id: string;
  title: string;
  hook: string;
  body: ScriptBody;
  steer_note: string | null;
  version: number;
  parent_id: string | null;
  is_picked: boolean;
  is_current: boolean;
  created_at: string;
}

export interface Clip {
  id: string;
  project_id: string;
  script_id: string;
  idx: number;
  dialogue: string;
  action: string;
  duration_s: number;
  location_preset_id: string | null;
  wardrobe_preset_id: string | null;
  status: ClipStatus;
}

export interface CheckerWarning {
  rule: string;
  severity: "warn" | "error";
  message: string;
}

export interface Prompt {
  id: string;
  clip_id: string;
  kind: PromptKind;
  body: string;
  version: number;
  parent_id: string | null;
  is_current: boolean;
  checker: CheckerWarning[];
  created_at: string;
}

export interface SavedPrompt {
  id: string;
  workspace_id: string;
  name: string;
  kind: PromptKind;
  body: string;
  sample_kind: AssetKind | null;
  sample_path: string | null;
  source_prompt_id: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  clip_id: string;
  kind: AssetKind;
  storage_path: string;
  source: AssetSource;
  flow_url: string | null;
  is_selected: boolean;
  created_at: string;
}

export interface Caption {
  id: string;
  project_id: string;
  caption: string;
  hashtags: string[];
  on_screen_text: string;
  ai_label: string;
  created_at: string;
}

export interface SendQueueItem {
  id: string;
  prompt_id: string;
  clip_id: string;
  ref_asset_id: string | null;
  asset_ref_url: string | null;
  status: QueueStatus;
  created_at: string;
}

export interface LlmUsage {
  id: string;
  project_id: string | null;
  step: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface ScheduledPost {
  id: string;
  workspace_id: string;
  project_id: string | null;
  scheduled_for: string;
  pillar: string | null;
  title: string;
  status: "planned" | "posted" | "skipped";
  posted_url: string | null;
}

export interface PostMetric {
  id: string;
  project_id: string;
  posted_at: string | null;
  platform: string;
  url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  notes: string | null;
  created_at: string;
}
