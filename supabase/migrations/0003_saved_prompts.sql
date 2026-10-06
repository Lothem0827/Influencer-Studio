-- Named prompt library, separate from clip prompt versions.

create table saved_prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind prompt_kind not null,
  body text not null,
  sample_kind asset_kind,
  sample_path text,
  source_prompt_id uuid references prompts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint saved_prompts_sample_pair check (
    (sample_kind is null and sample_path is null)
    or (sample_kind is not null and sample_path is not null)
  )
);

create index saved_prompts_ws_created_idx on saved_prompts (workspace_id, created_at desc);

alter table saved_prompts enable row level security;
