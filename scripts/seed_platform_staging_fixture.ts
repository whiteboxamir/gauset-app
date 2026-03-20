import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import * as nextEnv from "@next/env";

const loadEnvConfig =
    "loadEnvConfig" in nextEnv
        ? nextEnv.loadEnvConfig
        : typeof nextEnv.default === "object" && nextEnv.default && "loadEnvConfig" in nextEnv.default
          ? nextEnv.default.loadEnvConfig
          : null;

if (!loadEnvConfig) {
    throw new Error("Unable to resolve loadEnvConfig from @next/env.");
}

loadEnvConfig(process.cwd());

const DEFAULT_BASE_URL = "https://gauset.com";
const DEFAULT_OWNER_EMAIL = "design-partner-owner@gauset.dev";
const DEFAULT_OWNER_NAME = "Design Partner Trial Owner";
const DEFAULT_STUDIO_NAME = "Design Partner Trial Studio";
const DEFAULT_STUDIO_SLUG = "design-partner-trial";
const DEFAULT_PLAN_CODE = "design_partner_beta";
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPABASE_JWT_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const INVITE_EXPIRY_DAYS = 14;

type FixtureInviteRole = "admin" | "finance" | "member";

interface ProfileRow {
    id: string;
    email: string;
    display_name: string | null;
    onboarding_state: string;
    active_studio_id: string | null;
}

interface StudioRow {
    id: string;
    slug: string;
    name: string;
    billing_email: string | null;
    owner_user_id: string | null;
}

interface BrandingRow {
    studio_id: string;
    support_email: string | null;
    accent_color: string | null;
    website_url: string | null;
}

interface BillingContactRow {
    id: string;
    studio_id: string;
    full_name: string;
    email: string;
    is_default: boolean;
}

interface BillingCustomerRow {
    id: string;
    studio_id: string;
    provider_customer_id: string;
}

interface PlanRow {
    id: string;
    code: string;
    name: string;
    seat_limit: number | null;
}

interface SubscriptionRow {
    id: string;
    studio_id: string;
    status: string;
    provider_subscription_id: string | null;
    seat_count: number | null;
    created_at?: string | null;
}

interface InvitationRow {
    id: string;
    studio_id: string;
    email: string;
    role: FixtureInviteRole;
    status: "pending" | "accepted" | "revoked" | "expired";
    token: string;
    expires_at: string | null;
}

interface FixtureInviteSpec {
    email: string;
    role: FixtureInviteRole;
}

interface SeededInvitationSummary {
    email: string;
    role: FixtureInviteRole;
    invitationId: string | null;
    inviteUrl: string | null;
    mode: "created" | "updated" | "already_member";
}

const config = {
    baseUrl: (process.env.GAUSET_PLATFORM_BASE_URL ?? DEFAULT_BASE_URL).trim(),
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
    ownerEmail: (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase(),
    ownerPassword: (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD ?? "").trim(),
    ownerDisplayName: (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_NAME ?? DEFAULT_OWNER_NAME).trim(),
    studioName: (process.env.GAUSET_PLATFORM_FIXTURE_STUDIO_NAME ?? DEFAULT_STUDIO_NAME).trim(),
    studioSlug: (process.env.GAUSET_PLATFORM_FIXTURE_STUDIO_SLUG ?? DEFAULT_STUDIO_SLUG).trim().toLowerCase(),
    planCode: (process.env.GAUSET_PLATFORM_FIXTURE_PLAN_CODE ?? DEFAULT_PLAN_CODE).trim(),
    billingEmail: (process.env.GAUSET_PLATFORM_FIXTURE_BILLING_EMAIL ?? "").trim().toLowerCase(),
    supportEmail: (process.env.GAUSET_PLATFORM_FIXTURE_SUPPORT_EMAIL ?? "").trim().toLowerCase(),
    accentColor: (process.env.GAUSET_PLATFORM_FIXTURE_ACCENT_COLOR ?? "#0ea5e9").trim(),
    websiteUrl: (process.env.GAUSET_PLATFORM_FIXTURE_WEBSITE_URL ?? DEFAULT_BASE_URL).trim(),
    stripeSecretKey: (process.env.STRIPE_SECRET_KEY ?? "").trim(),
    stripeCustomerId: (process.env.GAUSET_PLATFORM_FIXTURE_STRIPE_CUSTOMER_ID ?? "").trim(),
    providerSubscriptionId: (process.env.GAUSET_PLATFORM_FIXTURE_PROVIDER_SUBSCRIPTION_ID ?? "").trim(),
    requestedSeatCount: (process.env.GAUSET_PLATFORM_FIXTURE_SEAT_COUNT ?? "").trim(),
    teamInvitesRaw: (process.env.GAUSET_PLATFORM_FIXTURE_TEAM_INVITES ?? "").trim(),
};

function assertRequiredConfig() {
    const missing = [
        !config.supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
        !config.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
        !config.ownerPassword ? "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD" : null,
        !config.ownerDisplayName ? "GAUSET_PLATFORM_FIXTURE_OWNER_NAME" : null,
        !config.studioName ? "GAUSET_PLATFORM_FIXTURE_STUDIO_NAME" : null,
        !config.studioSlug ? "GAUSET_PLATFORM_FIXTURE_STUDIO_SLUG" : null,
    ].filter(Boolean);

    if (missing.length > 0) {
        throw new Error(
            `Missing required staging fixture env: ${missing.join(", ")}. This script only seeds DB-backed staging records and does not prove live auth, billing, or webhook certification when those inputs are absent.`,
        );
    }
}

assertRequiredConfig();

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

function parseOptionalPositiveInteger(raw: string) {
    if (!raw) {
        return null;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("GAUSET_PLATFORM_FIXTURE_SEAT_COUNT must be a positive integer when provided.");
    }

    return parsed;
}

function parseTeamInviteSpecs(raw: string): FixtureInviteSpec[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [rawRole, rawEmail] = entry.split("=");
            const role = rawRole?.trim() as FixtureInviteRole | undefined;
            const email = normalizeEmail(rawEmail ?? "");

            if (!role || !["admin", "finance", "member"].includes(role)) {
                throw new Error(
                    `Invalid GAUSET_PLATFORM_FIXTURE_TEAM_INVITES entry "${entry}". Use comma-separated role=email pairs such as "admin=ops@gauset.dev,finance=billing@partner.com".`,
                );
            }
            if (!email || !email.includes("@")) {
                throw new Error(`Invalid GAUSET_PLATFORM_FIXTURE_TEAM_INVITES entry "${entry}". Expected a valid email after "${role}=".`);
            }

            return {
                role,
                email,
            };
        });
}

const teamInviteSpecs = parseTeamInviteSpecs(config.teamInvitesRaw);
const requestedSeatCount = parseOptionalPositiveInteger(config.requestedSeatCount);

function buildRestUrl(pathname: string, searchParams?: URLSearchParams) {
    const url = new URL(`/rest/v1/${pathname.replace(/^\//, "")}`, config.supabaseUrl);
    searchParams?.forEach((value, key) => {
        url.searchParams.set(key, value);
    });
    return url;
}

function buildAuthAdminUrl(pathname: string) {
    return new URL(`/auth/v1/admin/${pathname.replace(/^\//, "")}`, config.supabaseUrl);
}

function buildInviteUrl(token: string) {
    const origin = config.baseUrl.replace(/\/+$/, "");
    return `${origin}/auth/accept-invite?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/app/team")}`;
}

function isSupabaseJwtApiKey(apiKey: string) {
    return SUPABASE_JWT_KEY_PATTERN.test(apiKey.trim());
}

function createServiceHeaders(extra?: HeadersInit) {
    const headers = new Headers({
        apikey: config.serviceRoleKey,
        "Content-Type": "application/json",
    });

    if (isSupabaseJwtApiKey(config.serviceRoleKey)) {
        headers.set("Authorization", `Bearer ${config.serviceRoleKey}`);
    }

    new Headers(extra ?? {}).forEach((value, key) => {
        headers.set(key, value);
    });
    return headers;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with ${response.status}.`);
    }
    if (response.status === 204) {
        return null as T;
    }
    return (await response.json()) as T;
}

async function restSelect<T>(table: string, filters?: Record<string, string>) {
    const params = new URLSearchParams();
    params.set("select", "*");
    Object.entries(filters ?? {}).forEach(([key, value]) => {
        params.set(key, value);
    });

    const response = await fetch(buildRestUrl(table, params), {
        headers: createServiceHeaders(),
        cache: "no-store",
    });
    return parseJsonResponse<T>(response);
}

async function restInsert<T>(table: string, payload: Record<string, unknown>) {
    const response = await fetch(buildRestUrl(table), {
        method: "POST",
        headers: createServiceHeaders({
            Prefer: "return=representation",
        }),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseJsonResponse<T>(response);
}

async function restUpsert<T>(table: string, payload: Record<string, unknown>, onConflict: string) {
    const params = new URLSearchParams();
    params.set("on_conflict", onConflict);

    const response = await fetch(buildRestUrl(table, params), {
        method: "POST",
        headers: createServiceHeaders({
            Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseJsonResponse<T>(response);
}

async function restUpdate<T>(table: string, payload: Record<string, unknown>, filters: Record<string, string>) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        params.set(key, value);
    });

    const response = await fetch(buildRestUrl(table, params), {
        method: "PATCH",
        headers: createServiceHeaders({
            Prefer: "return=representation",
        }),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseJsonResponse<T>(response);
}

async function adminRequest<T>(pathname: string, method: "POST" | "PUT", payload: Record<string, unknown>) {
    const response = await fetch(buildAuthAdminUrl(pathname), {
        method,
        headers: createServiceHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseJsonResponse<T>(response);
}

async function selectProfileByEmail(email: string) {
    const rows = await restSelect<ProfileRow[]>("profiles", {
        email: `ilike.${email}`,
        limit: "1",
    });
    return rows[0] ?? null;
}

async function waitForProfile(email: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const profile = await selectProfileByEmail(email);
        if (profile) {
            return profile;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Profile for ${email} was not created.`);
}

async function ensureOwnerProfile() {
    const existingProfile = await selectProfileByEmail(config.ownerEmail);
    if (existingProfile) {
        await adminRequest(`users/${existingProfile.id}`, "PUT", {
            email: config.ownerEmail,
            password: config.ownerPassword,
            email_confirm: true,
            user_metadata: {
                full_name: config.ownerDisplayName,
            },
        });
        return waitForProfile(config.ownerEmail);
    }

    await adminRequest("users", "POST", {
        email: config.ownerEmail,
        password: config.ownerPassword,
        email_confirm: true,
        user_metadata: {
            full_name: config.ownerDisplayName,
        },
    });

    return waitForProfile(config.ownerEmail);
}

async function ensureStudio(owner: ProfileRow) {
    const upserted = await restUpsert<StudioRow[]>(
        "studios",
        {
            slug: config.studioSlug,
            name: config.studioName,
            billing_email: config.billingEmail || config.ownerEmail,
            owner_user_id: owner.id,
        },
        "slug",
    );
    const studio = upserted[0] ?? (await restSelect<StudioRow[]>("studios", { slug: `eq.${config.studioSlug}`, limit: "1" }))[0] ?? null;
    assert.ok(studio, "Unable to resolve the seeded studio.");

    await restUpsert<BrandingRow[]>(
        "studio_branding",
        {
            studio_id: studio.id,
            support_email: config.supportEmail || config.ownerEmail,
            accent_color: config.accentColor || null,
            website_url: config.websiteUrl || null,
        },
        "studio_id",
    );

    await restUpsert(
        "studio_memberships",
        {
            studio_id: studio.id,
            user_id: owner.id,
            role: "owner",
            status: "active",
            seat_kind: "paid",
        },
        "studio_id,user_id",
    );

    await restUpdate<ProfileRow[]>(
        "profiles",
        {
            display_name: config.ownerDisplayName,
            onboarding_state: "active",
            active_studio_id: studio.id,
        },
        {
            id: `eq.${owner.id}`,
        },
    );

    return studio;
}

async function ensureTeamInvitation(studio: StudioRow, invitedByUserId: string, spec: FixtureInviteSpec): Promise<SeededInvitationSummary> {
    const existingProfile = await selectProfileByEmail(spec.email);
    if (existingProfile) {
        const memberships = await restSelect<Array<{ id: string }>>("studio_memberships", {
            studio_id: `eq.${studio.id}`,
            user_id: `eq.${existingProfile.id}`,
            limit: "1",
        });

        if (memberships[0]) {
            return {
                email: spec.email,
                role: spec.role,
                invitationId: null,
                inviteUrl: null,
                mode: "already_member",
            };
        }
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * DAY_MS).toISOString();
    const existingInvitations = await restSelect<InvitationRow[]>("studio_invitations", {
        studio_id: `eq.${studio.id}`,
        email: `ilike.${spec.email}`,
        status: "eq.pending",
        limit: "1",
    });
    const existingInvitation = existingInvitations[0] ?? null;

    if (existingInvitation) {
        const updated = await restUpdate<InvitationRow[]>(
            "studio_invitations",
            {
                role: spec.role,
                expires_at: expiresAt,
            },
            {
                id: `eq.${existingInvitation.id}`,
            },
        );
        const invitation = updated[0] ?? existingInvitation;

        return {
            email: spec.email,
            role: spec.role,
            invitationId: invitation.id,
            inviteUrl: buildInviteUrl(invitation.token),
            mode: "updated",
        };
    }

    const token = randomUUID().replace(/-/g, "");
    const inserted = await restInsert<InvitationRow[]>("studio_invitations", {
        studio_id: studio.id,
        email: spec.email,
        role: spec.role,
        status: "pending",
        token,
        invited_by_user_id: invitedByUserId,
        expires_at: expiresAt,
    });
    const invitation = inserted[0] ?? null;

    return {
        email: spec.email,
        role: spec.role,
        invitationId: invitation?.id ?? null,
        inviteUrl: invitation ? buildInviteUrl(invitation.token) : null,
        mode: "created",
    };
}

async function ensureBillingContact(studio: StudioRow) {
    const existing = await restSelect<BillingContactRow[]>("billing_contacts", {
        studio_id: `eq.${studio.id}`,
        is_default: "eq.true",
        limit: "1",
    });

    if (existing[0]) {
        const updated = await restUpdate<BillingContactRow[]>(
            "billing_contacts",
            {
                full_name: config.ownerDisplayName,
                email: config.billingEmail || config.ownerEmail,
                is_default: true,
            },
            {
                id: `eq.${existing[0].id}`,
            },
        );
        return updated[0] ?? existing[0];
    }

    const inserted = await restInsert<BillingContactRow[]>("billing_contacts", {
        studio_id: studio.id,
        full_name: config.ownerDisplayName,
        email: config.billingEmail || config.ownerEmail,
        is_default: true,
    });
    return inserted[0] ?? null;
}

async function createStripeCustomer(studio: StudioRow) {
    if (config.stripeCustomerId) {
        return config.stripeCustomerId;
    }

    if (!config.stripeSecretKey) {
        return null;
    }

    const body = new URLSearchParams();
    body.set("email", config.billingEmail || config.ownerEmail);
    body.set("name", studio.name);
    body.set("metadata[fixture_slug]", config.studioSlug);
    body.set("metadata[studio_id]", studio.id);

    const response = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: new Headers({
            Authorization: `Bearer ${config.stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
        }),
        body,
        cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (!response.ok || !payload?.id) {
        throw new Error(payload?.error?.message || "Unable to create the Stripe customer fixture.");
    }

    return payload.id;
}

async function ensureBillingCustomer(studio: StudioRow) {
    const existing = await restSelect<BillingCustomerRow[]>("billing_customers", {
        studio_id: `eq.${studio.id}`,
        limit: "1",
    });

    const providerCustomerId =
        config.stripeCustomerId ||
        (existing[0]?.provider_customer_id?.startsWith("cus_") ? existing[0].provider_customer_id : null) ||
        (await createStripeCustomer(studio));

    if (!providerCustomerId) {
        return null;
    }

    const upserted = await restUpsert<BillingCustomerRow[]>(
        "billing_customers",
        {
            studio_id: studio.id,
            provider: "stripe",
            provider_customer_id: providerCustomerId,
        },
        "studio_id",
    );

    return upserted[0] ?? existing[0] ?? null;
}

async function ensureSubscription(studio: StudioRow, billingCustomer: BillingCustomerRow | null, requiredSeatCount: number) {
    const plans = await restSelect<PlanRow[]>("plans", {
        code: `eq.${config.planCode}`,
        limit: "1",
    });
    const plan = plans[0] ?? null;
    assert.ok(plan, `Plan ${config.planCode} was not found.`);

    const existingSubscriptions = await restSelect<SubscriptionRow[]>("subscriptions", {
        studio_id: `eq.${studio.id}`,
        order: "created_at.desc",
        limit: "1",
    });

    const providerSubscriptionId =
        config.providerSubscriptionId || `fixture_${config.studioSlug}_${config.planCode}`.replace(/[^a-z0-9_-]+/gi, "_");
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * DAY_MS);
    const seatCount = Math.max(requiredSeatCount, existingSubscriptions[0]?.seat_count ?? 0, 1);
    if (plan.seat_limit !== null && seatCount > plan.seat_limit) {
        throw new Error(
            `Requested seat provisioning (${seatCount}) exceeds the ${plan.code} plan ceiling (${plan.seat_limit}). Lower GAUSET_PLATFORM_FIXTURE_SEAT_COUNT or reduce GAUSET_PLATFORM_FIXTURE_TEAM_INVITES.`,
        );
    }

    const upserted = await restUpsert<SubscriptionRow[]>(
        "subscriptions",
        {
            studio_id: studio.id,
            plan_id: plan.id,
            billing_customer_id: billingCustomer?.id ?? null,
            provider_subscription_id: providerSubscriptionId,
            status: "active",
            seat_count: seatCount,
            current_period_starts_at: periodStart.toISOString(),
            current_period_ends_at: periodEnd.toISOString(),
            metadata: {
                source: "design_partner_trial_fixture",
                fixture_slug: config.studioSlug,
                target_base_url: config.baseUrl,
            },
        },
        "provider_subscription_id",
    );

    return {
        plan,
        subscription: upserted[0] ?? null,
        seatCount,
    };
}

const owner = await ensureOwnerProfile();
const studio = await ensureStudio(owner);
const seededInvitations = await Promise.all(teamInviteSpecs.map((spec) => ensureTeamInvitation(studio, owner.id, spec)));
const billingContact = await ensureBillingContact(studio);
const billingCustomer = await ensureBillingCustomer(studio);
const requiredSeatsForFixture = Math.max(1, 1 + seededInvitations.filter((invite) => invite.mode !== "already_member").length);
if (requestedSeatCount !== null && requestedSeatCount < requiredSeatsForFixture) {
    throw new Error(
        `GAUSET_PLATFORM_FIXTURE_SEAT_COUNT (${requestedSeatCount}) is smaller than the owner plus seeded invite footprint (${requiredSeatsForFixture}). Increase GAUSET_PLATFORM_FIXTURE_SEAT_COUNT or reduce GAUSET_PLATFORM_FIXTURE_TEAM_INVITES.`,
    );
}
const minimumSeatCount = Math.max(requestedSeatCount ?? 0, requiredSeatsForFixture);
const { plan, subscription, seatCount } = await ensureSubscription(studio, billingCustomer, minimumSeatCount);
const warnings = [
    !billingCustomer
        ? "Stripe customer was not created. This fixture still seeds the studio and subscription, but live billing portal and webhook proof still depend on STRIPE_SECRET_KEY or a preseeded GAUSET_PLATFORM_FIXTURE_STRIPE_CUSTOMER_ID."
        : null,
    seededInvitations.length === 0
        ? 'No pending partner invites were seeded. Set GAUSET_PLATFORM_FIXTURE_TEAM_INVITES using comma-separated role=email pairs such as "admin=ops@gauset.dev,finance=billing@partner.com".'
        : null,
    "This script seeds DB-backed staging state only. It does not prove live login, browser invitation acceptance, Stripe webhook delivery, or staging certification by itself.",
].filter(Boolean);

console.log(
    JSON.stringify(
        {
            ok: true,
            fixture: {
                ownerEmail: owner.email,
                ownerUserId: owner.id,
                studioId: studio.id,
                studioSlug: studio.slug,
                studioName: studio.name,
                planCode: plan.code,
                subscriptionId: subscription?.id ?? null,
                provisionedSeatCount: seatCount,
                planSeatLimit: plan.seat_limit,
                stripeCustomerId: billingCustomer?.provider_customer_id ?? null,
                billingContactEmail: billingContact?.email ?? null,
                supportEmail: config.supportEmail || config.ownerEmail,
                targetBaseUrl: config.baseUrl,
                seededInvitations,
            },
            warnings,
        },
        null,
        2,
    ),
);
