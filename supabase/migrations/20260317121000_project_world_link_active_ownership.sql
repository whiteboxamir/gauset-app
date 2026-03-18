alter table public.project_world_links
    add column if not exists ownership_status text;

update public.project_world_links
set ownership_status = 'active'
where ownership_status is null;

alter table public.project_world_links
    alter column ownership_status set default 'active';

alter table public.project_world_links
    alter column ownership_status set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'project_world_links_ownership_status_check'
    ) then
        alter table public.project_world_links
            add constraint project_world_links_ownership_status_check
            check (ownership_status in ('active', 'released', 'superseded'));
    end if;
end;
$$;

alter table public.project_world_links
    add column if not exists ownership_claimed_at timestamptz;

update public.project_world_links
set ownership_claimed_at = coalesce(ownership_claimed_at, created_at, timezone('utc', now()))
where ownership_claimed_at is null;

alter table public.project_world_links
    alter column ownership_claimed_at set default timezone('utc', now());

alter table public.project_world_links
    alter column ownership_claimed_at set not null;

with ranked_links as (
    select
        id,
        row_number() over (
            partition by scene_id
            order by is_primary desc, created_at asc, id asc
        ) as ownership_rank
    from public.project_world_links
)
update public.project_world_links as project_world_links
set
    ownership_status = case when ranked_links.ownership_rank = 1 then 'active' else 'superseded' end,
    ownership_claimed_at = coalesce(project_world_links.ownership_claimed_at, project_world_links.created_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
from ranked_links
where ranked_links.id = project_world_links.id
  and (
      ranked_links.ownership_rank = 1
      or project_world_links.ownership_status = 'active'
  );

create unique index if not exists project_world_links_scene_active_owner_idx
    on public.project_world_links (scene_id)
    where ownership_status = 'active';

create index if not exists project_world_links_project_active_created_idx
    on public.project_world_links (project_id, created_at desc)
    where ownership_status = 'active';

create or replace function public.claim_project_world_link(
    p_project_id uuid,
    p_scene_id text,
    p_environment_label text default null,
    p_make_primary boolean default false,
    p_created_by_user_id uuid default null
)
returns table (
    link_id uuid,
    project_id uuid,
    scene_id text,
    ownership_status text,
    conflicting_project_id uuid,
    created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_scene_id text := nullif(btrim(coalesce(p_scene_id, '')), '');
    v_existing_link_id uuid;
    v_conflicting_project_id uuid;
begin
    if p_project_id is null then
        raise exception 'Project id is required.';
    end if;

    if v_scene_id is null then
        raise exception 'Scene id is required.';
    end if;

    select id
    into v_existing_link_id
    from public.project_world_links
    where project_id = p_project_id
      and scene_id = v_scene_id
    limit 1;

    select project_id
    into v_conflicting_project_id
    from public.project_world_links
    where scene_id = v_scene_id
      and ownership_status = 'active'
      and project_id <> p_project_id
    order by created_at asc, id asc
    limit 1;

    if v_conflicting_project_id is not null then
        return query
        select null::uuid, p_project_id, v_scene_id, null::text, v_conflicting_project_id, false;
        return;
    end if;

    if coalesce(p_make_primary, false) then
        update public.project_world_links
        set
            is_primary = false,
            updated_at = v_now
        where project_id = p_project_id
          and ownership_status = 'active'
          and scene_id <> v_scene_id
          and is_primary = true;
    end if;

    begin
        insert into public.project_world_links (
            project_id,
            scene_id,
            environment_label,
            is_primary,
            created_by_user_id,
            ownership_status,
            ownership_claimed_at
        )
        values (
            p_project_id,
            v_scene_id,
            nullif(btrim(coalesce(p_environment_label, '')), ''),
            coalesce(p_make_primary, false),
            p_created_by_user_id,
            'active',
            v_now
        )
        on conflict (project_id, scene_id) do update
        set
            environment_label = coalesce(excluded.environment_label, public.project_world_links.environment_label),
            is_primary = case
                when excluded.is_primary then true
                else public.project_world_links.is_primary
            end,
            ownership_status = 'active',
            ownership_claimed_at = v_now,
            updated_at = v_now;
    exception
        when unique_violation then
            select project_id
            into v_conflicting_project_id
            from public.project_world_links
            where scene_id = v_scene_id
              and ownership_status = 'active'
              and project_id <> p_project_id
            order by created_at asc, id asc
            limit 1;

            if v_conflicting_project_id is not null then
                return query
                select null::uuid, p_project_id, v_scene_id, null::text, v_conflicting_project_id, false;
                return;
            end if;

            raise;
    end;

    return query
    select
        project_world_links.id,
        project_world_links.project_id,
        project_world_links.scene_id,
        project_world_links.ownership_status,
        null::uuid,
        v_existing_link_id is null
    from public.project_world_links
    where project_world_links.project_id = p_project_id
      and project_world_links.scene_id = v_scene_id
    limit 1;
end;
$$;
