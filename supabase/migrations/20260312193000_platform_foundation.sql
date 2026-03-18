create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    display_name text,
    avatar_url text,
    job_title text,
    timezone text not null default 'UTC',
    onboarding_state text not null default 'invited' check (onboarding_state in ('invited', 'active', 'suspended', 'closed')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (
        new.id,
        coalesce(new.email, ''),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
    )
    on conflict (id) do update
    set email = excluded.email;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_auth_user_created();

create table if not exists public.user_notification_preferences (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    product_updates boolean not null default true,
    billing_updates boolean not null default true,
    security_updates boolean not null default true,
    marketing_updates boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.studios (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    billing_email text,
    owner_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.studio_branding (
    studio_id uuid primary key references public.studios(id) on delete cascade,
    logo_url text,
    wordmark_url text,
    accent_color text,
    support_email text,
    website_url text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.studio_memberships (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member', 'finance')),
    status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
    seat_kind text not null default 'paid' check (seat_kind in ('paid', 'observer', 'internal')),
    invited_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, user_id)
);

create index if not exists studio_memberships_studio_status_idx
    on public.studio_memberships (studio_id, status);

create table if not exists public.studio_invitations (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    email text not null,
    role text not null check (role in ('owner', 'admin', 'member', 'finance')),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
    token text not null unique,
    invited_by_user_id uuid references public.profiles(id) on delete set null,
    accepted_by_user_id uuid references public.profiles(id) on delete set null,
    expires_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists studio_invitations_studio_status_idx
    on public.studio_invitations (studio_id, status);

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text,
    billing_provider text not null default 'stripe' check (billing_provider in ('stripe', 'manual')),
    interval text not null check (interval in ('month', 'year', 'custom')),
    price_cents integer not null default 0 check (price_cents >= 0),
    currency text not null default 'USD',
    seat_limit integer check (seat_limit is null or seat_limit > 0),
    world_limit integer check (world_limit is null or world_limit > 0),
    monthly_credit_limit integer check (monthly_credit_limit is null or monthly_credit_limit >= 0),
    features jsonb not null default '{}'::jsonb,
    is_public boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.plans (
    code,
    name,
    description,
    billing_provider,
    interval,
    price_cents,
    currency,
    seat_limit,
    world_limit,
    monthly_credit_limit,
    features,
    is_public,
    is_active
)
values
    (
        'design_partner_beta',
        'Design Partner Beta',
        'Invite-only design partner access with hands-on support and beta entitlements.',
        'manual',
        'custom',
        0,
        'USD',
        10,
        25,
        5000,
        '{"prioritySupport": true, "adminConsole": false, "mvpAccess": true}'::jsonb,
        false,
        true
    ),
    (
        'studio_monthly',
        'Studio Monthly',
        'Monthly production workspace with seats, worlds, and billing portal access.',
        'stripe',
        'month',
        24900,
        'USD',
        5,
        20,
        3000,
        '{"prioritySupport": false, "adminConsole": false, "mvpAccess": true}'::jsonb,
        true,
        true
    ),
    (
        'studio_yearly',
        'Studio Yearly',
        'Annual production workspace with expanded limits and billing control.',
        'stripe',
        'year',
        238800,
        'USD',
        8,
        40,
        4800,
        '{"prioritySupport": true, "adminConsole": false, "mvpAccess": true}'::jsonb,
        true,
        true
    )
on conflict (code) do update
set
    name = excluded.name,
    description = excluded.description,
    billing_provider = excluded.billing_provider,
    interval = excluded.interval,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    seat_limit = excluded.seat_limit,
    world_limit = excluded.world_limit,
    monthly_credit_limit = excluded.monthly_credit_limit,
    features = excluded.features,
    is_public = excluded.is_public,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

create table if not exists public.billing_customers (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null unique references public.studios(id) on delete cascade,
    provider text not null default 'stripe' check (provider in ('stripe', 'manual')),
    provider_customer_id text not null unique,
    default_payment_method_id text,
    billing_country text,
    tax_id text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_contacts (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    full_name text not null,
    email text not null,
    is_default boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    plan_id uuid not null references public.plans(id) on delete restrict,
    billing_customer_id uuid references public.billing_customers(id) on delete set null,
    provider_subscription_id text unique,
    status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete', 'unpaid')),
    seat_count integer not null default 1 check (seat_count > 0),
    trial_ends_at timestamptz,
    current_period_starts_at timestamptz,
    current_period_ends_at timestamptz,
    cancel_at timestamptz,
    canceled_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscriptions_studio_status_idx
    on public.subscriptions (studio_id, status);

create table if not exists public.subscription_items (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.subscriptions(id) on delete cascade,
    provider_item_id text unique,
    kind text not null check (kind in ('base', 'seat', 'credit_pack', 'storage')),
    quantity integer not null default 1 check (quantity > 0),
    unit_amount_cents integer not null default 0,
    currency text not null default 'USD',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invoices (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    subscription_id uuid references public.subscriptions(id) on delete set null,
    provider_invoice_id text unique,
    invoice_number text,
    status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
    currency text not null default 'USD',
    subtotal_cents integer not null default 0,
    tax_cents integer not null default 0,
    total_cents integer not null default 0,
    amount_paid_cents integer not null default 0,
    amount_remaining_cents integer not null default 0,
    invoice_url text,
    hosted_invoice_url text,
    issued_at timestamptz,
    due_at timestamptz,
    paid_at timestamptz,
    voided_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists invoices_studio_issued_idx
    on public.invoices (studio_id, issued_at desc nulls last);

create table if not exists public.invoice_line_items (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    description text not null,
    quantity integer not null default 1 check (quantity > 0),
    unit_amount_cents integer not null default 0,
    amount_cents integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    invoice_id uuid references public.invoices(id) on delete set null,
    provider_payment_intent_id text unique,
    status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded')),
    amount_cents integer not null default 0,
    currency text not null default 'USD',
    payment_method_brand text,
    payment_method_last4 text,
    paid_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists payments_studio_paid_idx
    on public.payments (studio_id, paid_at desc nulls last);

create table if not exists public.refunds (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id) on delete cascade,
    provider_refund_id text unique,
    amount_cents integer not null default 0,
    reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.credit_ledger (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    entry_type text not null check (entry_type in ('grant', 'usage', 'adjustment', 'refund', 'expiration')),
    amount integer not null,
    balance_after integer,
    reference_type text,
    reference_id uuid,
    note text,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists credit_ledger_studio_created_idx
    on public.credit_ledger (studio_id, created_at desc);

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid references public.studios(id) on delete cascade,
    owner_user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    slug text not null,
    description text,
    status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
    cover_image_url text,
    last_world_opened_at timestamptz,
    last_activity_at timestamptz,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (studio_id, slug)
);

create index if not exists projects_studio_activity_idx
    on public.projects (studio_id, last_activity_at desc nulls last);

create table if not exists public.project_memberships (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null check (role in ('owner', 'editor', 'reviewer', 'finance', 'viewer')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (project_id, user_id)
);

create table if not exists public.project_world_links (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scene_id text not null,
    environment_label text,
    is_primary boolean not null default false,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (project_id, scene_id)
);

create unique index if not exists project_world_links_primary_idx
    on public.project_world_links (project_id)
    where is_primary;

create index if not exists project_world_links_scene_idx
    on public.project_world_links (scene_id);

create table if not exists public.project_activity_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    actor_type text not null check (actor_type in ('user', 'system', 'admin')),
    event_type text not null,
    summary text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_activity_events_project_created_idx
    on public.project_activity_events (project_id, created_at desc);

create table if not exists public.project_exports (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    export_kind text not null check (export_kind in ('review_package', 'scene_json', 'video', 'still', 'other')),
    file_url text,
    status text not null default 'ready' check (status in ('ready', 'processing', 'failed')),
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.support_threads (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid not null references public.studios(id) on delete cascade,
    project_id uuid references public.projects(id) on delete set null,
    opened_by_user_id uuid references public.profiles(id) on delete set null,
    assigned_admin_user_id uuid references public.profiles(id) on delete set null,
    status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
    priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
    subject text not null,
    latest_message_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists support_threads_studio_latest_idx
    on public.support_threads (studio_id, latest_message_at desc nulls last);

create table if not exists public.support_messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references public.support_threads(id) on delete cascade,
    author_user_id uuid references public.profiles(id) on delete set null,
    author_type text not null check (author_type in ('user', 'admin', 'system')),
    body text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_flags (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade,
    studio_id uuid references public.studios(id) on delete cascade,
    flag_key text not null,
    flag_value jsonb not null default 'true'::jsonb,
    reason text,
    expires_at timestamptz,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (user_id is not null or studio_id is not null)
);

create table if not exists public.feature_flags (
    id uuid primary key default gen_random_uuid(),
    flag_key text not null,
    scope_type text not null check (scope_type in ('global', 'studio', 'user')),
    studio_id uuid references public.studios(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    enabled boolean not null default false,
    config jsonb not null default '{}'::jsonb,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (
        (scope_type = 'global' and studio_id is null and user_id is null) or
        (scope_type = 'studio' and studio_id is not null and user_id is null) or
        (scope_type = 'user' and user_id is not null and studio_id is null)
    )
);

create index if not exists feature_flags_key_scope_idx
    on public.feature_flags (flag_key, scope_type);

create table if not exists public.audit_events (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references public.profiles(id) on delete set null,
    actor_type text not null check (actor_type in ('user', 'admin', 'system')),
    studio_id uuid references public.studios(id) on delete cascade,
    target_type text not null,
    target_id text not null,
    event_type text not null,
    summary text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_events_studio_created_idx
    on public.audit_events (studio_id, created_at desc);

create table if not exists public.admin_notes (
    id uuid primary key default gen_random_uuid(),
    studio_id uuid references public.studios(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    project_id uuid references public.projects(id) on delete cascade,
    author_user_id uuid not null references public.profiles(id) on delete cascade,
    body text not null,
    visibility text not null default 'internal' check (visibility in ('internal', 'finance')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();

drop trigger if exists user_notification_preferences_set_updated_at on public.user_notification_preferences;
create trigger user_notification_preferences_set_updated_at before update on public.user_notification_preferences for each row execute procedure public.set_updated_at();

drop trigger if exists studios_set_updated_at on public.studios;
create trigger studios_set_updated_at before update on public.studios for each row execute procedure public.set_updated_at();

drop trigger if exists studio_branding_set_updated_at on public.studio_branding;
create trigger studio_branding_set_updated_at before update on public.studio_branding for each row execute procedure public.set_updated_at();

drop trigger if exists studio_memberships_set_updated_at on public.studio_memberships;
create trigger studio_memberships_set_updated_at before update on public.studio_memberships for each row execute procedure public.set_updated_at();

drop trigger if exists studio_invitations_set_updated_at on public.studio_invitations;
create trigger studio_invitations_set_updated_at before update on public.studio_invitations for each row execute procedure public.set_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans for each row execute procedure public.set_updated_at();

drop trigger if exists billing_customers_set_updated_at on public.billing_customers;
create trigger billing_customers_set_updated_at before update on public.billing_customers for each row execute procedure public.set_updated_at();

drop trigger if exists billing_contacts_set_updated_at on public.billing_contacts;
create trigger billing_contacts_set_updated_at before update on public.billing_contacts for each row execute procedure public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute procedure public.set_updated_at();

drop trigger if exists subscription_items_set_updated_at on public.subscription_items;
create trigger subscription_items_set_updated_at before update on public.subscription_items for each row execute procedure public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices for each row execute procedure public.set_updated_at();

drop trigger if exists invoice_line_items_set_updated_at on public.invoice_line_items;
create trigger invoice_line_items_set_updated_at before update on public.invoice_line_items for each row execute procedure public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments for each row execute procedure public.set_updated_at();

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at before update on public.refunds for each row execute procedure public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute procedure public.set_updated_at();

drop trigger if exists project_memberships_set_updated_at on public.project_memberships;
create trigger project_memberships_set_updated_at before update on public.project_memberships for each row execute procedure public.set_updated_at();

drop trigger if exists project_world_links_set_updated_at on public.project_world_links;
create trigger project_world_links_set_updated_at before update on public.project_world_links for each row execute procedure public.set_updated_at();

drop trigger if exists project_exports_set_updated_at on public.project_exports;
create trigger project_exports_set_updated_at before update on public.project_exports for each row execute procedure public.set_updated_at();

drop trigger if exists support_threads_set_updated_at on public.support_threads;
create trigger support_threads_set_updated_at before update on public.support_threads for each row execute procedure public.set_updated_at();

drop trigger if exists account_flags_set_updated_at on public.account_flags;
create trigger account_flags_set_updated_at before update on public.account_flags for each row execute procedure public.set_updated_at();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at before update on public.feature_flags for each row execute procedure public.set_updated_at();

drop trigger if exists admin_notes_set_updated_at on public.admin_notes;
create trigger admin_notes_set_updated_at before update on public.admin_notes for each row execute procedure public.set_updated_at();
