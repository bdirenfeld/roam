-- Help messages (24 Nov 2026): one conversation per person with Roam.
-- No policies on purpose: only the server (service role) reads or writes it,
-- after checking who is asking (src/app/api/help). Same shape as client_errors.
create table if not exists public.help_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_admin boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  picture_path text,
  -- Where they were when they wrote: screen, journey, device, paid or free.
  context jsonb not null default '{}'::jsonb,
  alerted boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists help_messages_user_idx on public.help_messages (user_id, created_at);
create index if not exists help_messages_recent_idx on public.help_messages (created_at);
alter table public.help_messages enable row level security;
revoke all on public.help_messages from anon, authenticated;

-- Private: pictures people attach. No policies, so server only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('help-pictures', 'help-pictures', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
