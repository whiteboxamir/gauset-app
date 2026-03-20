create table if not exists public.studio_governance_policies (
    studio_id uuid primary key references public.studios(id) on delete cascade,
    stale_invite_hours integer not null default 168 check (stale_invite_hours between 24 and 2160),
    stale_support_hours integer not null default 72 check (stale_support_hours between 12 and 720),
    stale_project_hours integer not null default 336 check (stale_project_hours between 24 and 2880),
    max_snooze_hours integer not null default 168 check (max_snooze_hours between 24 and 2160),
    require_admin_invite_approval boolean not null default true,
    require_elevated_role_change_approval boolean not null default true,
    require_sensitive_billing_approval boolean not null default false,
    require_policy_change_approval boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.studio_approval_requests (
    id uuid primary key default gen_random_uuid(),
    request_key text not null,
    studio_id uuid not null references public.studios(id) on delete cascade,
    request_type text not null check (request_type in ('admin_invitation', 'membership_role_change', 'billing_checkout', 'policy_change')),
    request_payload jsonb not null default '{}'::jsonb,
    summary text not null,
    detail text,
    href text not null,
    requested_by_user_id uuid references public.profiles(id) on delete set null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'canceled')),
    decision_note text,
    decided_by_user_id uuid references public.profiles(id) on delete set null,
    decided_at timestamptz,
    executed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists studio_approval_requests_pending_key_idx
    on public.studio_approval_requests (studio_id, request_key)
    where status = 'pending';

create index if not exists studio_approval_requests_studio_status_created_idx
    on public.studio_approval_requests (studio_id, status, created_at desc);

create table if not exists public.studio_access_reviews (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    status text not null default 'open' check (status in ('open', 'completed')),
    opened_by_user_id uuid references public.profiles(id) on delete set null,
    completed_by_user_id uuid references public.profiles(id) on delete set null,
    completed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists studio_access_reviews_open_idx
    on public.studio_access_reviews (studio_id)
    where status = 'open';

create index if not exists studio_access_reviews_studio_created_idx
    on public.studio_access_reviews (studio_id, created_at desc);

create table if not exists public.studio_access_review_entries (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.studio_access_reviews(id) on delete cascade,
    studio_id uuid not null references public.studios(id) on delete cascade,
    subject_type text not null check (subject_type in ('membership', 'invitation')),
    subject_id uuid not null,
    decision text check (decision in ('keep', 'revoke', 'escalate', 'defer')),
    note text,
    decided_by_user_id uuid references public.profiles(id) on delete set null,
    decided_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (review_id, subject_type, subject_id)
);

create index if not exists studio_access_review_entries_review_idx
    on public.studio_access_review_entries (review_id, subject_type);

create index if not exists studio_access_review_entries_studio_subject_idx
    on public.studio_access_review_entries (studio_id, subject_type, subject_id);

drop trigger if exists studio_governance_policies_set_updated_at on public.studio_governance_policies;
create trigger studio_governance_policies_set_updated_at
before update on public.studio_governance_policies
for each row execute procedure public.set_updated_at();

drop trigger if exists studio_approval_requests_set_updated_at on public.studio_approval_requests;
create trigger studio_approval_requests_set_updated_at
before update on public.studio_approval_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists studio_access_reviews_set_updated_at on public.studio_access_reviews;
create trigger studio_access_reviews_set_updated_at
before update on public.studio_access_reviews
for each row execute procedure public.set_updated_at();

drop trigger if exists studio_access_review_entries_set_updated_at on public.studio_access_review_entries;
create trigger studio_access_review_entries_set_updated_at
before update on public.studio_access_review_entries
for each row execute procedure public.set_updated_at();
