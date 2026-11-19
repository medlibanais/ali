---
description: Create the next free Supabase migration (number checked on origin/main and open branches) with an RLS template and a pgTAP test
argument-hint: <short_snake_case_name> [what the migration does]
allowed-tools: Bash(git fetch:*), Bash(git ls-tree:*), Bash(git for-each-ref:*), Bash(ls:*), Bash(npm run db:test:*), Bash(npx supabase status:*), Read, Write, Edit
---

Create a new Supabase migration for: $ARGUMENTS

Migration numbers have collided before because several threads work at once.
Every migration on `main` is already applied to the cloud database, so never
edit an existing one (a hook blocks it); always add a new file.

## 1. Find the next free number

1. Run `git fetch origin --prune --quiet`.
2. Collect every 4-digit prefix in `supabase/migrations/` on `origin/main` **and**
   on every other remote branch (open work claims numbers too):
   ```bash
   for ref in $(git for-each-ref --format='%(refname)' refs/remotes/origin); do
     git ls-tree --name-only "$ref" supabase/migrations/ 2>/dev/null
   done | sed -n 's#.*/\([0-9]\{4\}\)_.*#\1#p' | sort -u
   ```
   Also include the files in the local `supabase/migrations/` folder.
3. The new number is the highest number found plus 1, zero-padded to 4 digits.
   Gaps are fine for `supabase db push`. Tell the user which number you took
   and the highest one you saw.

## 2. Write the migration

Create `supabase/migrations/<NNNN>_<name>.sql`. Start with a header comment
(`-- PrayerLock <NNNN>: ...`) explaining what and why, then adapt this RLS
template. Keep only the parts the change needs, and never leave a new table
without RLS:

```sql
create table if not exists public.<table> (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
  -- columns...
);

create index if not exists <table>_user_idx on public.<table> (user_id);

alter table public.<table> enable row level security;

-- Owner-only access. (select auth.uid()) is evaluated once per query.
create policy <table>_select_own on public.<table>
  for select to authenticated using ((select auth.uid()) = user_id);
create policy <table>_insert_own on public.<table>
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy <table>_update_own on public.<table>
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy <table>_delete_own on public.<table>
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.<table> from anon;
```

Rules:
- Functions: `security invoker` by default. A `security definer` function must
  `set search_path = ''` (or `pg_catalog`), check `auth.uid()` itself, and
  `revoke execute ... from public, anon` before granting to `authenticated`.
- Views: `with (security_invoker = true)`.
- Friends may only see public stats, never another user's private rows.
- Use `if not exists` / `drop ... if exists` so the file can be re-run.

## 3. Add a pgTAP test

Create `supabase/tests/<name>_test.sql` following `supabase/tests/friends_test.sql`
(begin; plan; act as two users; check user A cannot read or write user B's
rows; finish; rollback).

## 4. Run the tests

If `npx supabase status` shows a running local stack, run `npm run db:test`
from the repo root and report the result. If Docker or the local stack is not
available, say so plainly; the `e2e-api` CI job applies every migration.

Finally, update the MIGRATIONS line in project memory with the number you used.
