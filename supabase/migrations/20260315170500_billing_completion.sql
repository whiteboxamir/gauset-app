alter table public.refunds
    add column if not exists studio_id uuid references public.studios(id) on delete cascade,
    add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
    add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
    add column if not exists provider_payment_intent_id text,
    add column if not exists provider_charge_id text,
    add column if not exists currency text not null default 'USD',
    add column if not exists status text not null default 'succeeded' check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
    add column if not exists refunded_at timestamptz;

update public.refunds as refunds
set
    studio_id = coalesce(refunds.studio_id, payments.studio_id),
    invoice_id = coalesce(refunds.invoice_id, payments.invoice_id),
    subscription_id = coalesce(refunds.subscription_id, invoices.subscription_id),
    provider_payment_intent_id = coalesce(refunds.provider_payment_intent_id, payments.provider_payment_intent_id),
    currency = coalesce(nullif(refunds.currency, ''), payments.currency, 'USD'),
    status = coalesce(nullif(refunds.status, ''), 'succeeded'),
    refunded_at = coalesce(refunds.refunded_at, refunds.created_at)
from public.payments as payments
left join public.invoices as invoices
    on invoices.id = payments.invoice_id
where refunds.payment_id = payments.id;

create index if not exists refunds_studio_refunded_idx
    on public.refunds (studio_id, refunded_at desc nulls last, created_at desc);

create index if not exists refunds_payment_refunded_idx
    on public.refunds (payment_id, refunded_at desc nulls last, created_at desc);

create unique index if not exists credit_ledger_reference_unique_idx
    on public.credit_ledger (entry_type, reference_type, reference_id)
    where reference_type is not null and reference_id is not null;
