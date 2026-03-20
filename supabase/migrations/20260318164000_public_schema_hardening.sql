-- Harden the public Data API surface for SQL-managed tables and routines.
-- The app accesses Supabase tables and RPCs server-side with the service role,
-- so we can safely deny direct anon/authenticated access by default.

do $$
declare
    target_table_name text;
begin
    foreach target_table_name in array array[
        'account_flags',
        'admin_notes',
        'audit_events',
        'billing_contacts',
        'billing_customers',
        'credit_ledger',
        'feature_flags',
        'invoice_line_items',
        'invoices',
        'payments',
        'plans',
        'profiles',
        'project_activity_events',
        'project_exports',
        'project_memberships',
        'project_world_links',
        'projects',
        'refunds',
        'review_share_events',
        'review_shares',
        'studio_access_review_entries',
        'studio_access_reviews',
        'studio_approval_requests',
        'studio_branding',
        'studio_coordination_items',
        'studio_governance_policies',
        'studio_invitations',
        'studio_lane_handoffs',
        'studio_memberships',
        'studio_notification_signals',
        'studio_notification_subscriptions',
        'studio_operator_coverage',
        'studios',
        'subscription_items',
        'subscriptions',
        'support_messages',
        'support_threads',
        'usage_events',
        'user_notification_deliveries',
        'user_notification_inbox_snapshots',
        'user_notification_preferences',
        'user_platform_sessions'
    ] loop
        execute format('alter table public.%I enable row level security', target_table_name);
    end loop;

    if exists (
        select 1
        from information_schema.tables as schema_tables
        where schema_tables.table_schema = 'public'
          and schema_tables.table_name = 'waitlist'
          and schema_tables.table_type = 'BASE TABLE'
    ) then
        execute 'alter table public.waitlist enable row level security';
    end if;
end;
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public grant execute on functions to service_role;
