create table if not exists public.user_platform_sessions (
    session_id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider text not null check (provider in ('magic_link', 'google', 'sso', 'admin')),
    label text not null,
    authenticated_at timestamptz not null,
    last_seen_at timestamptz not null default timezone('utc', now()),
    revoked_at timestamptz,
    revoked_reason text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_platform_sessions_user_active_idx
    on public.user_platform_sessions (user_id, revoked_at, last_seen_at desc);

drop trigger if exists user_platform_sessions_set_updated_at on public.user_platform_sessions;
create trigger user_platform_sessions_set_updated_at
before update on public.user_platform_sessions
for each row execute procedure public.set_updated_at();
