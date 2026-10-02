-- How-to videos (2 Oct 2026). Mock approved: video-placement-mock.html.
--
-- 1. Which videos a signed-in person has played or closed, on their own
--    users row, so the phone and the computer agree. {"first-journey": "<iso>"}.
--    The users table's own-row RLS (select/update id = auth.uid()) already
--    covers it; no new policy.
alter table public.users add column if not exists videos_seen jsonb not null default '{}'::jsonb;

-- 2. Mark one as seen without a read-modify-write race between two devices.
--    SECURITY INVOKER: the update runs under the caller's RLS, so it can only
--    ever touch the caller's own row.
create or replace function public.mark_video_seen(video text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.users
     set videos_seen = coalesce(videos_seen, '{}'::jsonb) || jsonb_build_object(video, now())
   where id = auth.uid();
$$;
revoke all on function public.mark_video_seen(text) from public, anon;
grant execute on function public.mark_video_seen(text) to authenticated;

-- 3. The files: a public bucket, read by anyone (the shared link has no
--    session). No write policies: only the service role uploads
--    (scripts/upload-video.mjs). videos.json in it says which are switched on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('how-to-videos', 'how-to-videos', true, 52428800,
        array['video/mp4', 'image/jpeg', 'image/png', 'application/json'])
on conflict (id) do nothing;
