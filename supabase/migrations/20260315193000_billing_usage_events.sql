create table if not exists public.usage_events (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    job_id text not null unique,
    job_type text not null check (job_type in ('generated_image', 'environment', 'asset')),
    job_status text not null check (job_status in ('processing', 'completed', 'failed')),
    image_id text,
    debit_amount integer not null default 1 check (debit_amount > 0),
    result_ids jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    reversed_by_refund_id uuid references public.refunds(id) on delete set null,
    reversed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists usage_events_studio_created_idx
    on public.usage_events (studio_id, created_at desc);

create index if not exists usage_events_status_updated_idx
    on public.usage_events (job_status, updated_at desc);

alter table public.credit_ledger
    drop constraint if exists credit_ledger_entry_type_check;

alter table public.credit_ledger
    add constraint credit_ledger_entry_type_check
    check (entry_type in ('grant', 'usage', 'adjustment', 'refund', 'expiration', 'reversal'));
