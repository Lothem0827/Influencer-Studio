-- Chosen seconds per clip. Veo defaults to 10 and cannot exceed 10.
alter table projects add column if not exists clip_seconds int not null default 10;
