-- Phase 4: library tags, content calendar, performance log

alter table projects add column if not exists tags text[] not null default '{}';
create index if not exists projects_tags_idx on projects using gin (tags);

create type post_status as enum ('planned', 'posted', 'skipped');

create table scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  scheduled_for date not null,
  pillar text,
  title text not null,
  status post_status not null default 'planned',
  posted_url text,
  created_at timestamptz not null default now()
);
create index scheduled_posts_ws_date_idx on scheduled_posts (workspace_id, scheduled_for);

create table post_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  posted_at date,
  platform text not null default 'tiktok',
  url text,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index post_metrics_project_idx on post_metrics (project_id);

alter table scheduled_posts enable row level security;
alter table post_metrics enable row level security;
