-- ============================================================
-- CodeSnap -- Job History schema
-- ============================================================
-- Run this once in the Supabase SQL Editor for THIS project's own Supabase
-- instance (CodeSnap needs its own Supabase project, separate from any other
-- app's -- see docs/SUPABASE_SETUP.md for how to create one and wire it up).
--
-- What this is for: a signed-in user's past photo analyses, so they can come
-- back later and re-read a job's guidance/code citations without re-
-- uploading the photo and re-running the analysis.
--
-- Design goals (same discipline as Circle Squared's saved_contacts table):
--   * Row Level Security is ON.
--   * A signed-in user may SELECT, INSERT, and DELETE only their own rows.
--     Unlike Circle Squared's saved_contacts (a paid-subscriber perk gated
--     through a SECURITY DEFINER RPC), job history here has no payment gate
--     to enforce server-side -- any signed-in user may save their own
--     history -- so plain RLS policies are enough; no RPC layer is needed
--     for this feature.
--   * The photo itself is NOT stored in this table or anywhere server-side
--     in this version -- only the analysis text and the metadata the user
--     typed (state, county, notes). Storing the actual photo would need a
--     Supabase Storage bucket, deliberately left out of this version to keep
--     the scope small; see docs/PLAN.md's v2 notes.
-- ============================================================

create table if not exists public.job_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  county text,
  notes text,
  analysis_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_history_user on public.job_history (user_id, created_at desc);

alter table public.job_history enable row level security;

grant select, insert, delete on public.job_history to authenticated;

create policy "select own job history"
  on public.job_history for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own job history"
  on public.job_history for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "delete own job history"
  on public.job_history for delete
  to authenticated
  using (auth.uid() = user_id);

-- No update policy -- a saved job's analysis is a historical record of what
-- was said at the time, not something meant to be edited after the fact.
