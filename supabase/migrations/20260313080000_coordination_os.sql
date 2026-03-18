create table if not exists public.studio_coordination_items (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    item_key text not null,
    assignee_user_id uuid references public.profiles(id) on delete set null,
    status text not null default 'open' check (status in ('open', 'in_progress', 'snoozed', 'resolved')),
    snoozed_until timestamptz,
    resolution_note text,
    resolved_at timestamptz,
    resolved_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, item_key)
);

create index if not exists studio_coordination_items_studio_status_updated_idx
    on public.studio_coordination_items (studio_id, status, updated_at desc);

create index if not exists studio_coordination_items_studio_assignee_status_idx
    on public.studio_coordination_items (studio_id, assignee_user_id, status, updated_at desc);

drop trigger if exists studio_coordination_items_set_updated_at on public.studio_coordination_items;
create trigger studio_coordination_items_set_updated_at
before update on public.studio_coordination_items
for each row execute procedure public.set_updated_at();
