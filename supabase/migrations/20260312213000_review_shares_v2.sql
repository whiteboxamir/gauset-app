create table if not exists public.review_shares (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id) on delete cascade,
    studio_id uuid references public.studios(id) on delete cascade,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    scene_id text,
    version_id text,
    status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
    token_id text not null unique,
    label text,
    note text,
    delivery_mode text not null default 'secure_link' check (delivery_mode in ('secure_link', 'manual')),
    allowed_api_paths text[] not null default '{}',
    storage_prefixes text[] not null default '{}',
    inline_payload text,
    issued_at timestamptz not null,
    expires_at timestamptz not null,
    last_accessed_at timestamptz,
    revoked_at timestamptz,
    revoked_by_user_id uuid references public.profiles(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists review_shares_project_status_created_idx
    on public.review_shares (project_id, status, created_at desc);

create index if not exists review_shares_studio_status_created_idx
    on public.review_shares (studio_id, status, created_at desc);

create index if not exists review_shares_scene_created_idx
    on public.review_shares (scene_id, created_at desc);

create table if not exists public.review_share_events (
    id uuid primary key default gen_random_uuid(),
    review_share_id uuid not null references public.review_shares(id) on delete cascade,
    project_id uuid references public.projects(id) on delete cascade,
    studio_id uuid references public.studios(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    event_type text not null check (event_type in ('created', 'copied', 'opened', 'accessed', 'revoked', 'expired', 'failed_access')),
    request_path text,
    summary text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists review_share_events_share_created_idx
    on public.review_share_events (review_share_id, created_at desc);

create index if not exists review_share_events_project_created_idx
    on public.review_share_events (project_id, created_at desc);

drop trigger if exists review_shares_set_updated_at on public.review_shares;
create trigger review_shares_set_updated_at before update on public.review_shares for each row execute procedure public.set_updated_at();
