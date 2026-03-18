alter table public.user_notification_preferences
    add column if not exists in_app_enabled boolean not null default true,
    add column if not exists digest_enabled boolean not null default true,
    add column if not exists digest_cadence text not null default 'daily' check (digest_cadence in ('daily', 'weekly')),
    add column if not exists digest_hour_utc integer not null default 16 check (digest_hour_utc between 0 and 23),
    add column if not exists digest_weekday integer not null default 1 check (digest_weekday between 0 and 6);

create table if not exists public.studio_notification_subscriptions (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    domain text not null check (domain in ('workspace', 'billing', 'team', 'support', 'projects', 'governance', 'coverage')),
    following boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, user_id, domain)
);

create index if not exists studio_notification_subscriptions_lookup_idx
    on public.studio_notification_subscriptions (studio_id, user_id, domain);

create table if not exists public.studio_notification_signals (
    id uuid primary key default gen_random_uuid(),
    signal_key text not null,
    studio_id uuid not null references public.studios(id) on delete cascade,
    domain text not null check (domain in ('workspace', 'billing', 'team', 'support', 'projects', 'governance', 'coverage')),
    severity text not null check (severity in ('info', 'warning', 'urgent')),
    source_type text not null,
    source_id text,
    title text not null,
    body text not null,
    href text not null,
    audience_label text not null default 'Relevant workspace operators',
    why text not null default 'Platform state changed.',
    resolved_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, signal_key)
);

create index if not exists studio_notification_signals_studio_updated_idx
    on public.studio_notification_signals (studio_id, resolved_at, updated_at desc);

create table if not exists public.user_notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    signal_id uuid not null references public.studio_notification_signals(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    state text not null default 'pending' check (state in ('pending', 'delivered', 'acknowledged', 'dismissed')),
    delivery_reason text not null default 'Workspace membership and lane subscription matched this signal.',
    delivered_at timestamptz,
    acknowledged_at timestamptz,
    dismissed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (signal_id, user_id)
);

create index if not exists user_notification_deliveries_user_state_idx
    on public.user_notification_deliveries (user_id, state, updated_at desc);

drop trigger if exists studio_notification_subscriptions_set_updated_at on public.studio_notification_subscriptions;
create trigger studio_notification_subscriptions_set_updated_at
before update on public.studio_notification_subscriptions
for each row execute procedure public.set_updated_at();

drop trigger if exists studio_notification_signals_set_updated_at on public.studio_notification_signals;
create trigger studio_notification_signals_set_updated_at
before update on public.studio_notification_signals
for each row execute procedure public.set_updated_at();

drop trigger if exists user_notification_deliveries_set_updated_at on public.user_notification_deliveries;
create trigger user_notification_deliveries_set_updated_at
before update on public.user_notification_deliveries
for each row execute procedure public.set_updated_at();
