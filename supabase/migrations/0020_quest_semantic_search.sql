-- PrayerLock 0020: semantic search over the quest library.
--
-- Each predefined quest gets a 384-dim embedding from gte-small, the model
-- built into Supabase Edge Functions (no OpenAI key, no paid API). Postgres
-- cannot embed text by itself, so the flow is:
--   app -> edge function search-quests (embeds the query with gte-small)
--       -> rpc search_quests(query_embedding) (cosine search, this file)
-- generate-embeddings fills every quest whose embedding is null.

create extension if not exists vector with schema extensions;

alter table public.predefined_quests
  add column if not exists embedding extensions.vector(384);

-- Changing what a quest says makes its old vector wrong: clear it so the
-- next generate-embeddings (or search-quests' self-heal) re-embeds it.
-- New quests start with a null embedding and are picked up the same way.
create or replace function public.predefined_quests_clear_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.pillar is distinct from old.pillar
     or new.tags is distinct from old.tags then
    new.embedding := null;
  end if;
  return new;
end;
$$;

drop trigger if exists predefined_quests_clear_embedding on public.predefined_quests;
create trigger predefined_quests_clear_embedding
  before update on public.predefined_quests
  for each row execute function public.predefined_quests_clear_embedding();

-- HNSW keeps the search sub-millisecond as the library grows; at 100 rows
-- the planner may still pick a plain scan, which is just as fast.
create index if not exists predefined_quests_embedding_hnsw
  on public.predefined_quests
  using hnsw (embedding extensions.vector_cosine_ops);

-- Top-N quests by cosine similarity (1 = same meaning). SECURITY INVOKER,
-- so RLS on predefined_quests applies (read-only for signed-in users).
create or replace function public.search_quests(
  query_embedding extensions.vector(384),
  match_count int default 5
)
returns table (
  id uuid,
  pillar text,
  title text,
  description text,
  difficulty text,
  xp_reward int,
  time_estimate_minutes int,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    p.id, p.pillar, p.title, p.description, p.difficulty, p.xp_reward,
    p.time_estimate_minutes,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.predefined_quests p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.search_quests(extensions.vector, int) from public, anon;
grant execute on function public.search_quests(extensions.vector, int) to authenticated, service_role;

-- Users keep read-only access to predefined_quests (policy predefined_read
-- from 0001). Only the service role (generate-embeddings) writes vectors.
