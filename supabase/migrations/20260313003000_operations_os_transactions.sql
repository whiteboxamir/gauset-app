create or replace function public.platform_slugify_text(value text)
returns text
language sql
immutable
as $$
    select coalesce(
        nullif(
            trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')),
            ''
        ),
        'studio'
    );
$$;

create or replace function public.platform_allocate_studio_slug(value text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_base text := public.platform_slugify_text(value);
    v_candidate text := v_base;
    v_suffix text;
    v_attempt integer := 0;
begin
    loop
        exit when not exists (
            select 1
            from public.studios
            where slug = v_candidate
        );

        v_attempt := v_attempt + 1;
        if v_attempt > 32 then
            raise exception 'Unable to allocate a unique studio slug.';
        end if;

        v_suffix := substring(encode(gen_random_bytes(3), 'hex') from 1 for 6);
        v_candidate := left(v_base, greatest(1, 48 - 1 - char_length(v_suffix))) || '-' || v_suffix;
    end loop;

    return v_candidate;
end;
$$;

create or replace function public.create_studio_workspace(
    actor_user_id uuid,
    requested_name text,
    requested_billing_email text default null,
    requested_support_email text default null,
    requested_accent_color text default null,
    requested_website_url text default null
)
returns table (
    studio_id uuid,
    studio_slug text,
    studio_name text,
    membership_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_profile public.profiles%rowtype;
    v_studio_id uuid;
    v_slug text;
    v_name text := nullif(trim(coalesce(requested_name, '')), '');
    v_billing_email text := nullif(trim(coalesce(requested_billing_email, '')), '');
begin
    select *
    into v_profile
    from public.profiles
    where id = actor_user_id
    limit 1;

    if not found then
        raise exception 'Profile not found.';
    end if;

    if v_name is null then
        raise exception 'Studio name is required.';
    end if;

    v_slug := public.platform_allocate_studio_slug(v_name);

    insert into public.studios (
        slug,
        name,
        billing_email,
        owner_user_id
    )
    values (
        v_slug,
        v_name,
        coalesce(v_billing_email, nullif(trim(coalesce(v_profile.email, '')), '')),
        actor_user_id
    )
    returning id into v_studio_id;

    insert into public.studio_memberships (
        studio_id,
        user_id,
        role,
        status,
        seat_kind
    )
    values (
        v_studio_id,
        actor_user_id,
        'owner',
        'active',
        'paid'
    )
    on conflict (studio_id, user_id) do update
    set
        role = 'owner',
        status = 'active',
        seat_kind = 'paid',
        updated_at = v_now;

    insert into public.studio_branding (
        studio_id,
        support_email,
        accent_color,
        website_url
    )
    values (
        v_studio_id,
        nullif(trim(coalesce(requested_support_email, '')), ''),
        nullif(trim(coalesce(requested_accent_color, '')), ''),
        nullif(trim(coalesce(requested_website_url, '')), '')
    )
    on conflict (studio_id) do update
    set
        support_email = excluded.support_email,
        accent_color = excluded.accent_color,
        website_url = excluded.website_url,
        updated_at = v_now;

    update public.profiles
    set
        active_studio_id = v_studio_id,
        onboarding_state = 'active',
        updated_at = v_now
    where id = actor_user_id;

    insert into public.audit_events (
        actor_user_id,
        actor_type,
        studio_id,
        target_type,
        target_id,
        event_type,
        summary,
        metadata,
        created_at
    )
    values
        (
            actor_user_id,
            'user',
            v_studio_id,
            'studio',
            v_studio_id::text,
            'studio.created',
            format('Created studio workspace %s.', v_name),
            jsonb_build_object('slug', v_slug),
            v_now
        ),
        (
            actor_user_id,
            'user',
            v_studio_id,
            'profile',
            actor_user_id::text,
            'account.active_studio_selected',
            format('Activated workspace %s.', v_name),
            '{}'::jsonb,
            v_now
        );

    return query
    select
        v_studio_id,
        v_slug,
        v_name,
        'owner'::text;
end;
$$;

create or replace function public.finalize_workspace_invitation(
    actor_user_id uuid,
    invitation_token text
)
returns table (
    studio_id uuid,
    membership_id uuid,
    studio_name text,
    membership_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_invitation public.studio_invitations%rowtype;
    v_profile_email text;
    v_membership_id uuid;
    v_membership_role text;
    v_studio_name text;
begin
    select *
    into v_invitation
    from public.studio_invitations
    where token = invitation_token
    limit 1;

    if not found then
        raise exception 'Invite not found.';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Invite is no longer active.';
    end if;

    if v_invitation.expires_at is not null and v_invitation.expires_at < v_now then
        update public.studio_invitations
        set
            status = 'expired',
            updated_at = v_now
        where id = v_invitation.id
          and status = 'pending';

        raise exception 'Invite is no longer active.';
    end if;

    select email
    into v_profile_email
    from public.profiles
    where id = actor_user_id
    limit 1;

    if v_profile_email is null then
        raise exception 'Profile not found.';
    end if;

    if lower(v_profile_email) <> lower(v_invitation.email) then
        raise exception 'Invite email does not match the authenticated account.';
    end if;

    insert into public.studio_memberships (
        studio_id,
        user_id,
        role,
        status,
        seat_kind
    )
    values (
        v_invitation.studio_id,
        actor_user_id,
        v_invitation.role,
        'active',
        'paid'
    )
    on conflict (studio_id, user_id) do update
    set
        role = excluded.role,
        status = 'active',
        updated_at = v_now
    returning
        id,
        role
    into
        v_membership_id,
        v_membership_role;

    update public.studio_invitations
    set
        status = 'accepted',
        accepted_by_user_id = actor_user_id,
        accepted_at = v_now,
        updated_at = v_now
    where id = v_invitation.id;

    update public.profiles
    set
        active_studio_id = v_invitation.studio_id,
        onboarding_state = 'active',
        updated_at = v_now
    where id = actor_user_id;

    select name
    into v_studio_name
    from public.studios
    where id = v_invitation.studio_id
    limit 1;

    insert into public.audit_events (
        actor_user_id,
        actor_type,
        studio_id,
        target_type,
        target_id,
        event_type,
        summary,
        metadata,
        created_at
    )
    values
        (
            actor_user_id,
            'user',
            v_invitation.studio_id,
            'membership',
            v_membership_id::text,
            'auth.invite_finalized',
            format('Accepted workspace invite for %s.', coalesce(v_studio_name, 'Studio')),
            jsonb_build_object('invitationId', v_invitation.id),
            v_now
        ),
        (
            actor_user_id,
            'user',
            v_invitation.studio_id,
            'profile',
            actor_user_id::text,
            'account.active_studio_selected',
            format('Activated workspace %s.', coalesce(v_studio_name, 'Studio')),
            '{}'::jsonb,
            v_now
        );

    return query
    select
        v_invitation.studio_id,
        v_membership_id,
        coalesce(v_studio_name, 'Studio'),
        coalesce(v_membership_role, v_invitation.role);
end;
$$;
