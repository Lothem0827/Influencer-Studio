-- Influencer Studio: core schema (all phases share this base)
create extension if not exists "pgcrypto";

create type preset_kind as enum ('location', 'wardrobe');
create type template_step as enum ('script', 'still', 'video', 'caption');
create type clip_status as enum ('draft', 'still_prompted', 'imaged', 'video_prompted', 'video_done', 'posted');
create type prompt_kind as enum ('still', 'video');
create type asset_kind as enum ('image', 'video');
create type asset_source as enum ('paste', 'upload', 'extension');
create type queue_status as enum ('queued', 'sent', 'done');
create type project_status as enum ('idea', 'scripts', 'stills', 'videos', 'finished');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  nickname text,
  niche text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table identity_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  appearance_lock text not null default '',
  wardrobe_dna text not null default '',
  palette text not null default '',
  voice text not null default '',
  banned text not null default '',
  -- [{ "name": "ginhawa", "weight": 70 }, ...]
  pillars jsonb not null default '[]'::jsonb,
  face_ref_urls text[] not null default '{}',
  character_sheet_url text
);

create table house_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade, -- null = global
  text text not null,
  enabled boolean not null default true,
  sort int not null default 0
);

create table presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind preset_kind not null,
  name text not null,
  body text not null default '',
  ref_url text
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade, -- null = global
  step template_step not null,
  name text not null,
  system_prompt text not null,
  is_default boolean not null default false
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  idea text not null,
  target_model text not null default 'veo', -- veo | seedance | kling
  language text not null default 'Taglish',
  pillar text,
  aspect_ratio text not null default '9:16',
  clip_count int, -- null = auto
  status project_status not null default 'idea',
  picked_script_id uuid,
  created_at timestamptz not null default now()
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  hook text not null default '',
  -- { "clips": [{ "dialogue": "...", "action": "...", "duration_s": 8 }] }
  body jsonb not null,
  steer_note text,
  version int not null default 1,
  parent_id uuid references scripts(id) on delete set null,
  is_picked boolean not null default false,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

alter table projects
  add constraint projects_picked_script_fk
  foreign key (picked_script_id) references scripts(id) on delete set null;

create table clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  idx int not null,
  dialogue text not null default '',
  action text not null default '',
  duration_s int not null default 8,
  location_preset_id uuid references presets(id) on delete set null,
  wardrobe_preset_id uuid references presets(id) on delete set null,
  status clip_status not null default 'draft',
  unique (script_id, idx)
);

create table prompts (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips(id) on delete cascade,
  kind prompt_kind not null,
  body text not null,
  version int not null default 1,
  parent_id uuid references prompts(id) on delete set null,
  is_current boolean not null default true,
  checker jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index prompts_one_current on prompts (clip_id, kind) where is_current;

create table assets (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips(id) on delete cascade,
  kind asset_kind not null,
  storage_path text not null,
  source asset_source not null default 'upload',
  flow_url text,
  is_selected boolean not null default true,
  created_at timestamptz not null default now()
);
create index assets_clip_idx on assets (clip_id, kind);

create table captions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  caption text not null default '',
  hashtags text[] not null default '{}',
  on_screen_text text not null default '',
  ai_label text not null default 'AI-generated content',
  created_at timestamptz not null default now()
);

create table send_queue (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  clip_id uuid not null references clips(id) on delete cascade,
  ref_asset_id uuid references assets(id) on delete set null,
  asset_ref_url text,
  status queue_status not null default 'queued',
  created_at timestamptz not null default now()
);
create index send_queue_status_idx on send_queue (status, created_at);

create table llm_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  step text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

-- Single-user app: the server uses the service role key. RLS is enabled with no
-- policies so the anon key can never read or write anything directly.
alter table workspaces enable row level security;
alter table identity_packs enable row level security;
alter table house_rules enable row level security;
alter table presets enable row level security;
alter table templates enable row level security;
alter table projects enable row level security;
alter table scripts enable row level security;
alter table clips enable row level security;
alter table prompts enable row level security;
alter table assets enable row level security;
alter table captions enable row level security;
alter table send_queue enable row level security;
alter table llm_usage enable row level security;

-- Private storage buckets (50 MB limit; adjust for long videos in the dashboard)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('images', 'images', false, 20971520),
  ('videos', 'videos', false, 209715200),
  ('refs', 'refs', false, 20971520)
on conflict (id) do nothing;
