alter table public.profiles
    add column if not exists active_studio_id uuid references public.studios(id) on delete set null;

create index if not exists profiles_active_studio_idx
    on public.profiles (active_studio_id);

update public.profiles as profiles
set active_studio_id = (
    select memberships.studio_id
    from public.studio_memberships as memberships
    where memberships.user_id = profiles.id
      and memberships.status = 'active'
    order by memberships.created_at asc, memberships.studio_id asc
    limit 1
)
where profiles.active_studio_id is null;
