create table if not exists public.user_notification_inbox_snapshots (
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    unread_count integer not null default 0 check (unread_count >= 0),
    preview_delivery_ids uuid[] not null default '{}',
    synced_at timestamptz,
    refreshed_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (studio_id, user_id)
);

create index if not exists user_notification_inbox_snapshots_user_idx
    on public.user_notification_inbox_snapshots (user_id, refreshed_at desc);

drop trigger if exists user_notification_inbox_snapshots_set_updated_at on public.user_notification_inbox_snapshots;
create trigger user_notification_inbox_snapshots_set_updated_at
before update on public.user_notification_inbox_snapshots
for each row execute procedure public.set_updated_at();
