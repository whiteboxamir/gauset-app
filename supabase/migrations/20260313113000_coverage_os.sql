alter table public.studio_governance_policies
    add column if not exists max_active_items_per_available_operator integer not null default 5 check (max_active_items_per_available_operator between 1 and 24),
    add column if not exists max_urgent_items_per_available_operator integer not null default 2 check (max_urgent_items_per_available_operator between 1 and 12),
    add column if not exists urgent_ownership_drift_hours integer not null default 6 check (urgent_ownership_drift_hours between 1 and 168);

create table if not exists public.studio_operator_coverage (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    coverage_status text not null default 'available' check (coverage_status in ('available', 'focused', 'away', 'backup')),
    effective_until timestamptz,
    note text,
    covers_workspace boolean not null default false,
    covers_billing boolean not null default false,
    covers_team boolean not null default false,
    covers_support boolean not null default false,
    covers_projects boolean not null default false,
    max_active_items_override integer check (max_active_items_override between 1 and 48),
    max_urgent_items_override integer check (max_urgent_items_override between 1 and 24),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, user_id)
);

create index if not exists studio_operator_coverage_studio_status_idx
    on public.studio_operator_coverage (studio_id, coverage_status, effective_until nulls last, updated_at desc);

create index if not exists studio_operator_coverage_studio_user_idx
    on public.studio_operator_coverage (studio_id, user_id);

drop trigger if exists studio_operator_coverage_set_updated_at on public.studio_operator_coverage;
create trigger studio_operator_coverage_set_updated_at
before update on public.studio_operator_coverage
for each row execute procedure public.set_updated_at();
