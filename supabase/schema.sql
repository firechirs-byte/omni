-- =====================================================================
-- Omni — supabase/schema.sql   (for Omni v4)
-- HOW TO USE: Supabase Dashboard → SQL Editor → New query → paste ALL of
-- this → Run. It is safe to run again later (it only adds what's missing
-- and refreshes the rules), so after an Omni update you can just re-run it.
--
-- It creates:  profiles · channels (group chats + DMs) · channel_members ·
--              messages · the "avatars" and "gifs" picture buckets
-- and the Row Level Security (RLS) rules that keep everything private.
--
-- The big idea of RLS: the database itself checks every request. The
-- "anon"/publishable key in config.js is public, but with these rules
-- nobody can read a chat they aren't in, or change someone else's message.
-- =====================================================================

-- ---------- 1. Profiles (one per account) ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);
-- (columns are added one by one so re-running this file upgrades an older copy)
alter table public.profiles add column if not exists status       text;
alter table public.profiles add column if not exists avatar_url   text;
alter table public.profiles add column if not exists friend_code  text;   -- share it in person so a friend can DM you
alter table public.profiles add column if not exists is_minor     boolean not null default true;  -- safest default: treat as a kid
alter table public.profiles add column if not exists parent_email text;   -- who should approve a minor's account
alter table public.profiles add column if not exists parent_id    uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists parent_approved_at timestamptz;
alter table public.profiles alter column friend_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
update public.profiles set friend_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) where friend_code is null;
create unique index if not exists profiles_friend_code on public.profiles (friend_code);
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len check (char_length(display_name) between 1 and 24);
alter table public.profiles drop constraint if exists profiles_status_len;
alter table public.profiles add constraint profiles_status_len check (status is null or char_length(status) <= 40);

-- Make a profile automatically when someone signs up (from the sign-up form's "metadata")
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_minor, parent_email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Omni user'), 24),
    coalesce((new.raw_user_meta_data ->> 'is_minor')::boolean, true),
    nullif(new.raw_user_meta_data ->> 'parent_email', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kids can't switch off their own safety settings: is_minor, the parent fields and
-- the friend code can only be changed by the linked parent (or an admin in the dashboard).
create or replace function public.protect_profile_safety_fields() returns trigger
language plpgsql as $$
begin
  if (new.is_minor is distinct from old.is_minor
      or new.parent_id is distinct from old.parent_id
      or new.parent_email is distinct from old.parent_email
      or new.parent_approved_at is distinct from old.parent_approved_at
      or new.friend_code is distinct from old.friend_code)
     and auth.uid() is not distinct from old.id then
    raise exception 'Only a parent or guardian can change these settings';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_safety on public.profiles;
create trigger protect_profile_safety before update on public.profiles
  for each row execute function public.protect_profile_safety_fields();

-- ---------- 2. Channels (group chats AND direct messages) + members ----------
create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mode        text not null default 'casual',
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.channels add column if not exists kind        text not null default 'group';  -- 'group' or 'dm'
alter table public.channels add column if not exists invite_code text;   -- groups: share it to let friends join
alter table public.channels add column if not exists dm_key      text;   -- DMs: "<id1>:<id2>" so there's only one DM per pair
alter table public.channels alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
create unique index if not exists channels_invite_code on public.channels (invite_code);
create unique index if not exists channels_dm_key on public.channels (dm_key);
alter table public.channels drop constraint if exists channels_kind_ok;
alter table public.channels add constraint channels_kind_ok check (kind in ('group', 'dm'));
alter table public.channels drop constraint if exists channels_mode_ok;
alter table public.channels add constraint channels_mode_ok check (mode in ('gaming', 'school', 'work', 'casual'));
alter table public.channels drop constraint if exists channels_name_len;
alter table public.channels add constraint channels_name_len check (char_length(name) between 1 and 32);

create table if not exists public.channel_members (
  channel_id  uuid not null references public.channels (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member',
  joined_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.channel_members drop constraint if exists members_role_ok;
alter table public.channel_members add constraint members_role_ok check (role in ('owner', 'moderator', 'member'));

-- Helper functions (SECURITY DEFINER = they skip RLS, which stops the rules checking themselves in a loop)
create or replace function public.is_member(ch uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from channel_members where channel_id = ch and user_id = auth.uid());
$$;
create or replace function public.is_channel_owner(ch uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from channel_members where channel_id = ch and user_id = auth.uid() and role in ('owner', 'moderator'));
$$;
create or replace function public.channel_kind(ch uuid) returns text
language sql security definer stable set search_path = public as $$
  select kind from channels where id = ch;
$$;
create or replace function public.my_parent_id() returns uuid
language sql security definer stable set search_path = public as $$
  select parent_id from profiles where id = auth.uid();
$$;
create or replace function public.shares_channel_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from channel_members a join channel_members b on a.channel_id = b.channel_id
                 where a.user_id = auth.uid() and b.user_id = other);
$$;

-- Whoever creates a channel becomes its owner
create or replace function public.add_channel_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into channel_members (channel_id, user_id, role) values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_channel_created on public.channels;
create trigger on_channel_created after insert on public.channels
  for each row execute function public.add_channel_owner();

-- Join a group chat with its invite code (the app's "Join with code" button)
create or replace function public.join_channel(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ch uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into ch from channels where kind = 'group' and invite_code = upper(trim(code));
  if ch is null then raise exception 'No chat has that invite code'; end if;
  insert into channel_members (channel_id, user_id) values (ch, auth.uid()) on conflict do nothing;
  return ch;
end $$;

-- Start (or re-open) a direct message with someone, using THEIR friend code.
-- Nobody can be found by searching, so only people who were given the code can DM.
create or replace function public.start_dm(friend text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid; k text; ch uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into other from profiles where friend_code = upper(trim(friend));
  if other is null then raise exception 'No one has that friend code'; end if;
  if other = auth.uid() then raise exception 'That is your own friend code'; end if;
  k := least(auth.uid()::text, other::text) || ':' || greatest(auth.uid()::text, other::text);
  insert into channels (kind, name, mode, created_by, dm_key, invite_code)
    values ('dm', 'dm', 'casual', auth.uid(), k, null)
    on conflict (dm_key) do nothing;
  select id into ch from channels where dm_key = k;
  insert into channel_members (channel_id, user_id) values (ch, auth.uid()), (ch, other) on conflict do nothing;
  return ch;
end $$;

-- ---------- 3. Messages ----------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.messages add column if not exists author_name text;   -- copied from the profile by a trigger
alter table public.messages add column if not exists text        text;
alter table public.messages add column if not exists gif_url     text;
alter table public.messages add column if not exists edited_at   timestamptz;
alter table public.messages drop constraint if exists messages_text_len;
alter table public.messages add constraint messages_text_len check (text is null or char_length(text) <= 2000);
alter table public.messages drop constraint if exists messages_gif_https;
alter table public.messages add constraint messages_gif_https check (gif_url is null or gif_url like 'https://%');
alter table public.messages drop constraint if exists messages_not_empty;
alter table public.messages add constraint messages_not_empty check (text is not null or gif_url is not null);
create index if not exists messages_channel_time on public.messages (channel_id, created_at desc);

create or replace function public.set_author_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_name := (select display_name from profiles where id = new.user_id);
  return new;
end $$;
drop trigger if exists messages_author on public.messages;
create trigger messages_author before insert on public.messages
  for each row execute function public.set_author_name();

-- ---------- 4. Row Level Security (the privacy rules) ----------
alter table public.profiles        enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;

-- Profiles: see yourself, people you share a chat with, your linked parent, and your linked children
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_channel_with(id) or parent_id = auth.uid()
         or id = public.my_parent_id());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid() or parent_id = auth.uid()) with check (id = auth.uid() or parent_id = auth.uid());

-- Channels: members only. Group chats are created directly; DMs only through start_dm().
drop policy if exists "channels: members read" on public.channels;
create policy "channels: members read" on public.channels for select to authenticated
  using (public.is_member(id) or created_by = auth.uid());
drop policy if exists "channels: create own" on public.channels;
create policy "channels: create own" on public.channels for insert to authenticated
  with check (created_by = auth.uid() and kind = 'group');
drop policy if exists "channels: owner edits" on public.channels;
create policy "channels: owner edits" on public.channels for update to authenticated
  using (public.is_channel_owner(id) and kind = 'group') with check (kind = 'group');
drop policy if exists "channels: owner deletes" on public.channels;
create policy "channels: owner deletes" on public.channels for delete to authenticated
  using (created_by = auth.uid() and kind = 'group');

-- Members: see who's in your chats; group owners/moderators add or remove people; anyone can leave
drop policy if exists "members: read" on public.channel_members;
create policy "members: read" on public.channel_members for select to authenticated
  using (public.is_member(channel_id));
drop policy if exists "members: owners add" on public.channel_members;
create policy "members: owners add" on public.channel_members for insert to authenticated
  with check (public.is_channel_owner(channel_id) and public.channel_kind(channel_id) = 'group');
drop policy if exists "members: owners remove or leave" on public.channel_members;
create policy "members: owners remove or leave" on public.channel_members for delete to authenticated
  using (public.is_channel_owner(channel_id) or user_id = auth.uid());

-- Messages: members read + post; you can only edit or delete YOUR OWN messages
drop policy if exists "messages: members read" on public.messages;
create policy "messages: members read" on public.messages for select to authenticated
  using (public.is_member(channel_id));
drop policy if exists "messages: members post" on public.messages;
create policy "messages: members post" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(channel_id));
drop policy if exists "messages: edit own" on public.messages;
create policy "messages: edit own" on public.messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(channel_id));
drop policy if exists "messages: delete own" on public.messages;
create policy "messages: delete own" on public.messages for delete to authenticated
  using (user_id = auth.uid());

-- Only signed-in people use the tables (the anon role gets nothing)
revoke all on public.profiles, public.channels, public.channel_members, public.messages from anon;
grant select, insert, update, delete on public.channels, public.channel_members, public.messages to authenticated;
-- Profiles: other people only ever see your name, status and picture. Your email, parent's
-- email, is_minor and friend code stay private (you read your own with my_profile() below).
revoke all on public.profiles from authenticated;
grant select (id, display_name, status, avatar_url, created_at) on public.profiles to authenticated;
grant update (display_name, status, avatar_url) on public.profiles to authenticated;

-- Your own full profile (including your friend code)
create or replace function public.my_profile() returns setof public.profiles
language sql security definer stable set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
revoke execute on function public.join_channel(text), public.start_dm(text) from public, anon;
grant execute on function public.join_channel(text), public.start_dm(text) to authenticated;

-- ---------- 5. Live updates (Realtime) ----------
alter table public.messages replica identity full;
do $$ begin alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channel_members;   -- so a new DM pops up live
exception when duplicate_object then null; end $$;

-- ---------- 6. Storage buckets for pictures ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg', 'image/png']),
       ('gifs', 'gifs', true, 1572864, array['image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can LOOK at pictures (public buckets, via their link). You can only
-- upload / replace / delete files inside YOUR folder: <your user id>/...
drop policy if exists "pictures: read own" on storage.objects;
create policy "pictures: read own" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'gifs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pictures: upload own" on storage.objects;
create policy "pictures: upload own" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'gifs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pictures: update own" on storage.objects;
create policy "pictures: update own" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'gifs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pictures: delete own" on storage.objects;
create policy "pictures: delete own" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'gifs') and (storage.foldername(name))[1] = auth.uid()::text);

-- Done! Omni's "Online" chip should now say it's ready. (Re-running this file is safe.)
