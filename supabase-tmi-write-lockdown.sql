-- Run once in the Supabase SQL editor after the updated Render server is live.
-- Public visitors may read TMI posts, but only the Render service-role client
-- may create, update, or delete them. The service role bypasses RLS.

alter table public.tmi_posts enable row level security;

revoke insert, update, delete on table public.tmi_posts from anon, authenticated;
grant select on table public.tmi_posts to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tmi_posts'
      and policyname = 'CineTMI public read'
  ) then
    create policy "CineTMI public read"
      on public.tmi_posts
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

-- Existing permissive write policies can remain defined, but the revoked table
-- privileges above prevent anon/authenticated clients from using them.
-- Keep the current Storage policies for the `images` bucket because the browser
-- still uploads a selected image before asking Render to save the post.
