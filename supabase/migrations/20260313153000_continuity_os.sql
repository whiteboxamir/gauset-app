alter table public.studio_governance_policies
    add column if not exists stale_handoff_hours integer not null default 24 check (stale_handoff_hours between 1 and 720),
    add column if not exists require_handoff_for_away_with_urgent_work boolean not null default true;

create table if not exists public.studio_lane_handoffs (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    domain text not null check (domain in ('workspace', 'billing', 'team', 'support', 'projects')),
    summary text,
    active_risks jsonb not null default '[]'::jsonb,
    next_actions jsonb not null default '[]'::jsonb,
    primary_operator_user_id uuid references public.profiles(id) on delete set null,
    backup_operator_user_id uuid references public.profiles(id) on delete set null,
    review_by_at timestamptz,
    updated_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, domain)
);

create index if not exists studio_lane_handoffs_studio_review_idx
    on public.studio_lane_handoffs (studio_id, review_by_at nulls last, updated_at desc);

drop trigger if exists studio_lane_handoffs_set_updated_at on public.studio_lane_handoffs;
create trigger studio_lane_handoffs_set_updated_at
before update on public.studio_lane_handoffs
for each row execute procedure public.set_updated_at();
