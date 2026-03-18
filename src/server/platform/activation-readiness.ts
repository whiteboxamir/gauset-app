import fs from "node:fs/promises";
import path from "node:path";

import { getAuthConfig } from "../auth/config.ts";
import { getBillingConfig } from "../billing/config.ts";
import { probeStripeCatalogAccess } from "../billing/stripe.ts";
import { getPlatformDatabaseConfig, hasPlatformDirectDatabaseUrls, hasPlatformRestConfig } from "../db/client.ts";
import { restSelect } from "../db/rest.ts";
import { parseExplicitPlatformBool, resolveMvpAccessMode } from "../mvp/access-gate.ts";

export type ActivationReadinessStatus = "ready" | "partial" | "blocked" | "skipped";
export type ActivationCapabilityClassification =
    | "implemented_and_verified"
    | "implemented_but_not_operational"
    | "scaffolded_only"
    | "documented_but_not_landed"
    | "intentionally_unavailable"
    | "regression_risk_area";
export type ActivationCapabilityId =
    | "auth"
    | "sessions"
    | "billing"
    | "entitlements_and_gated_mvp_access"
    | "studios_and_workspaces"
    | "projects_and_world_links"
    | "admin_and_account_platform"
    | "staging_and_platform_activation";

export interface ActivationReadinessProbe {
    status: ActivationReadinessStatus;
    summary: string;
    detail?: string | null;
}

export interface ActivationReadinessSection {
    status: ActivationReadinessStatus;
    summary: string;
    missingEnv: string[];
    warnings: string[];
    details: Record<string, unknown>;
    probe: ActivationReadinessProbe | null;
}

export interface PlatformActivationReadinessSnapshot {
    checkedAt: string;
    status: Exclude<ActivationReadinessStatus, "skipped">;
    activationStatus: Exclude<ActivationReadinessStatus, "skipped">;
    auth: ActivationReadinessSection;
    database: ActivationReadinessSection;
    billing: ActivationReadinessSection;
    migrations: ActivationReadinessSection;
    integration: ActivationReadinessSection;
    rollout: ActivationReadinessSection;
    capabilities: ActivationCapabilityAssessment[];
    actions: string[];
}

export interface ActivationCapabilityAssessment {
    capability: ActivationCapabilityId;
    classification: ActivationCapabilityClassification;
    locallyVerified: boolean;
    operational: boolean;
    requiresLiveCertification: boolean;
    summary: string;
    blockers: string[];
    evidence: string[];
    verification: string[];
}

interface PlatformActivationReadinessOptions {
    env?: NodeJS.ProcessEnv;
    includeConnectivity?: boolean;
    migrationDirectory?: string;
}

function resolveSectionStatus(statuses: ActivationReadinessStatus[]): Exclude<ActivationReadinessStatus, "skipped"> {
    if (statuses.includes("blocked")) {
        return "blocked";
    }
    if (statuses.includes("partial")) {
        return "partial";
    }
    return "ready";
}

function formatMissingEnv(message: string, missingEnv: string[]) {
    return `${message} Missing: ${missingEnv.join(", ")}.`;
}

function createSkippedProbe(summary: string): ActivationReadinessProbe {
    return {
        status: "skipped",
        summary,
        detail: null,
    };
}

function createCapabilityAssessment({
    capability,
    classification,
    locallyVerified = true,
    operational,
    requiresLiveCertification = false,
    summary,
    blockers = [],
    evidence,
    verification,
}: {
    capability: ActivationCapabilityId;
    classification: ActivationCapabilityClassification;
    locallyVerified?: boolean;
    operational: boolean;
    requiresLiveCertification?: boolean;
    summary: string;
    blockers?: string[];
    evidence: string[];
    verification: string[];
}): ActivationCapabilityAssessment {
    return {
        capability,
        classification,
        locallyVerified,
        operational,
        requiresLiveCertification,
        summary,
        blockers,
        evidence,
        verification,
    };
}

function dedupeStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function readBooleanDetail(section: ActivationReadinessSection, key: string) {
    return section.details[key] === true;
}

async function listMigrationFiles(migrationDirectory: string) {
    const entries = await fs.readdir(migrationDirectory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
        .map((entry) => entry.name)
        .sort();
}

async function buildAuthSection(env: NodeJS.ProcessEnv): Promise<ActivationReadinessSection> {
    try {
        const config = getAuthConfig(env);
        const missingEnv: string[] = [];
        if (!config.supabaseUrl) missingEnv.push("NEXT_PUBLIC_SUPABASE_URL");
        if (!config.supabaseAnonKey) missingEnv.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
        if (!config.serviceRoleKey) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");
        if (!config.appUrl) missingEnv.push("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL");

        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            return {
                status: "blocked",
                summary: formatMissingEnv("Supabase auth cannot issue or validate sessions.", missingEnv),
                missingEnv,
                warnings: [],
                details: {
                    googleAuthEnabled: config.googleAuthEnabled,
                    appUrlConfigured: Boolean(config.appUrl),
                },
                probe: createSkippedProbe("Connectivity probe skipped until Supabase auth credentials exist."),
            };
        }

        if (!config.serviceRoleKey || !config.appUrl) {
            return {
                status: "partial",
                summary: formatMissingEnv("Basic auth is configured, but platform session tracking and redirects are incomplete.", missingEnv),
                missingEnv,
                warnings: config.serviceRoleKey ? [] : ["Tracked platform sessions and invitation finalization depend on SUPABASE_SERVICE_ROLE_KEY."],
                details: {
                    googleAuthEnabled: config.googleAuthEnabled,
                    appUrlConfigured: Boolean(config.appUrl),
                },
                probe: createSkippedProbe("Auth configuration is only partially complete."),
            };
        }

        return {
            status: "ready",
            summary: "Supabase auth configuration is present for login, callback redirects, and tracked platform sessions.",
            missingEnv: [],
            warnings: [],
            details: {
                googleAuthEnabled: config.googleAuthEnabled,
                appUrlConfigured: true,
            },
            probe: createSkippedProbe("Auth config presence verified. Connectivity is exercised through real login flows."),
        };
    } catch (error) {
        return {
            status: "blocked",
            summary: "Auth environment variables failed validation.",
            missingEnv: [],
            warnings: [],
            details: {},
            probe: {
                status: "blocked",
                summary: "Auth config parse failed.",
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

async function buildDatabaseSection({
    env,
    includeConnectivity,
}: {
    env: NodeJS.ProcessEnv;
    includeConnectivity: boolean;
}): Promise<ActivationReadinessSection> {
    try {
        const config = getPlatformDatabaseConfig(env);
        const restConfigured = hasPlatformRestConfig(env);
        const directUrlsConfigured = hasPlatformDirectDatabaseUrls(env);
        const missingEnv: string[] = [];

        if (!config.supabaseUrl) missingEnv.push("NEXT_PUBLIC_SUPABASE_URL");
        if (!config.supabaseAnonKey) missingEnv.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
        if (!config.supabaseServiceRoleKey) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");

        if (!restConfigured) {
            const warnings =
                directUrlsConfigured && !restConfigured
                    ? ["Direct DATABASE_URL values are present, but the current platform services use Supabase REST and will remain offline until Supabase credentials are set."]
                    : [];
            return {
                status: "blocked",
                summary: formatMissingEnv("Platform data services are not ready.", missingEnv),
                missingEnv,
                warnings,
                details: {
                    restConfigured,
                    directUrlsConfigured,
                },
                probe: createSkippedProbe("Database connectivity probe skipped until Supabase REST credentials exist."),
            };
        }

        if (!includeConnectivity) {
            return {
                status: "ready",
                summary: "Supabase REST credentials are present for the platform data services.",
                missingEnv: [],
                warnings: [],
                details: {
                    restConfigured,
                    directUrlsConfigured,
                },
                probe: createSkippedProbe("Run with connectivity enabled to verify the migrated tables are reachable."),
            };
        }

        try {
            await restSelect<Array<{ id: string }>>("plans", {
                select: "id",
                filters: {
                    limit: "1",
                },
            });
            return {
                status: "ready",
                summary: "Supabase REST credentials are present and the platform tables are reachable.",
                missingEnv: [],
                warnings: [],
                details: {
                    restConfigured,
                    directUrlsConfigured,
                },
                probe: {
                    status: "ready",
                    summary: "Supabase REST probe succeeded against the `plans` table.",
                    detail: null,
                },
            };
        } catch (error) {
            return {
                status: "blocked",
                summary: "Supabase REST credentials exist, but the platform tables are not reachable yet.",
                missingEnv: [],
                warnings: [],
                details: {
                    restConfigured,
                    directUrlsConfigured,
                },
                probe: {
                    status: "blocked",
                    summary: "Supabase REST probe failed.",
                    detail: error instanceof Error ? error.message : String(error),
                },
            };
        }
    } catch (error) {
        return {
            status: "blocked",
            summary: "Platform database environment variables failed validation.",
            missingEnv: [],
            warnings: [],
            details: {},
            probe: {
                status: "blocked",
                summary: "Database config parse failed.",
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

async function buildBillingSection({
    env,
    includeConnectivity,
}: {
    env: NodeJS.ProcessEnv;
    includeConnectivity: boolean;
}): Promise<ActivationReadinessSection> {
    try {
        const config = getBillingConfig(env);
        const missingEnv: string[] = [];
        if (!config.stripeSecretKey) missingEnv.push("STRIPE_SECRET_KEY");
        if (!config.stripeWebhookSecret) missingEnv.push("STRIPE_WEBHOOK_SECRET");
        if (!config.appUrl) missingEnv.push("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL");

        if (!config.stripeSecretKey) {
            return {
                status: "blocked",
                summary: formatMissingEnv("Stripe billing is not enabled.", missingEnv),
                missingEnv,
                warnings: [],
                details: {
                    webhookConfigured: Boolean(config.stripeWebhookSecret),
                    appUrlConfigured: Boolean(config.appUrl),
                },
                probe: createSkippedProbe("Stripe probe skipped until STRIPE_SECRET_KEY exists."),
            };
        }

        if (!config.stripeWebhookSecret || !config.appUrl) {
            return {
                status: "partial",
                summary: formatMissingEnv("Stripe API access exists, but webhook verification or app redirects are incomplete.", missingEnv),
                missingEnv,
                warnings: !config.stripeWebhookSecret ? ["Webhook delivery cannot be trusted until STRIPE_WEBHOOK_SECRET is set."] : [],
                details: {
                    webhookConfigured: Boolean(config.stripeWebhookSecret),
                    appUrlConfigured: Boolean(config.appUrl),
                },
                probe: createSkippedProbe("Stripe config is only partially complete."),
            };
        }

        if (!includeConnectivity) {
            return {
                status: "ready",
                summary: "Stripe configuration is present for checkout, portal, and webhook verification.",
                missingEnv: [],
                warnings: [],
                details: {
                    webhookConfigured: true,
                    appUrlConfigured: true,
                },
                probe: createSkippedProbe("Run with connectivity enabled to verify Stripe API access."),
            };
        }

        try {
            const probe = await probeStripeCatalogAccess();
            return {
                status: "ready",
                summary: "Stripe configuration is present and the API is reachable.",
                missingEnv: [],
                warnings: [],
                details: {
                    webhookConfigured: true,
                    appUrlConfigured: true,
                },
                probe: {
                    status: "ready",
                    summary: "Stripe API probe succeeded.",
                    detail: `${probe.object} responded with ${probe.productCount} visible product(s).`,
                },
            };
        } catch (error) {
            return {
                status: "blocked",
                summary: "Stripe configuration is present, but the API probe failed.",
                missingEnv: [],
                warnings: [],
                details: {
                    webhookConfigured: true,
                    appUrlConfigured: true,
                },
                probe: {
                    status: "blocked",
                    summary: "Stripe API probe failed.",
                    detail: error instanceof Error ? error.message : String(error),
                },
            };
        }
    } catch (error) {
        return {
            status: "blocked",
            summary: "Billing environment variables failed validation.",
            missingEnv: [],
            warnings: [],
            details: {},
            probe: {
                status: "blocked",
                summary: "Billing config parse failed.",
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

async function buildMigrationSection(migrationDirectory: string): Promise<ActivationReadinessSection> {
    try {
        const files = await listMigrationFiles(migrationDirectory);
        const hasFoundation = files.includes("20260312193000_platform_foundation.sql");
        if (files.length === 0 || !hasFoundation) {
            return {
                status: "blocked",
                summary: "The local platform migration set is incomplete.",
                missingEnv: [],
                warnings: [],
                details: {
                    migrationDirectory,
                    fileCount: files.length,
                    files,
                },
                probe: {
                    status: "blocked",
                    summary: "Expected platform foundation migration is missing.",
                    detail: null,
                },
            };
        }

        return {
            status: "ready",
            summary: `Local repository includes ${files.length} platform migration file(s).`,
            missingEnv: [],
            warnings: ["This only verifies the repo contains migrations. It does not prove they have been applied to staging."],
            details: {
                migrationDirectory,
                fileCount: files.length,
                files,
            },
            probe: createSkippedProbe("Migration application must be verified against staging."),
        };
    } catch (error) {
        return {
            status: "blocked",
            summary: "Unable to inspect the local platform migration directory.",
            missingEnv: [],
            warnings: [],
            details: {
                migrationDirectory,
            },
            probe: {
                status: "blocked",
                summary: "Migration directory probe failed.",
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

function buildIntegrationSection({
    auth,
    database,
    billing,
}: {
    auth: ActivationReadinessSection;
    database: ActivationReadinessSection;
    billing: ActivationReadinessSection;
}): ActivationReadinessSection {
    const blockedBy = [auth, database, billing]
        .map((section, index) => ({ section, name: ["auth", "database", "billing"][index] }))
        .filter((entry) => entry.section.status !== "ready")
        .map((entry) => entry.name);

    if (blockedBy.length > 0) {
        return {
            status: blockedBy.some((entry) => entry === "auth" || entry === "database" || entry === "billing") ? "blocked" : "partial",
            summary: `Phase 2 entitlement integration is not ready yet because ${blockedBy.join(", ")} is not green.`,
            missingEnv: [],
            warnings: [],
            details: {
                blockedBy,
                mvpGateShouldStayOff: true,
            },
            probe: createSkippedProbe("Enable the MVP entitlement gate only after auth, database, and billing are ready."),
        };
    }

    return {
        status: "ready",
        summary: "Auth, billing, and database prerequisites are ready for staging-only MVP entitlement gating.",
        missingEnv: [],
        warnings: [],
        details: {
            blockedBy: [],
            mvpGateShouldStayOff: false,
        },
        probe: createSkippedProbe("The remaining work is staged E2E certification, not environment activation."),
    };
}

function buildRolloutSection({
    env,
    integration,
}: {
    env: NodeJS.ProcessEnv;
    integration: ActivationReadinessSection;
}): ActivationReadinessSection {
    const explicitGate = parseExplicitPlatformBool(env.GAUSET_ENABLE_PLATFORM_MVP_GATE);
    const anonymousRequested = parseExplicitPlatformBool(env.GAUSET_ALLOW_ANONYMOUS_MVP) === true;
    const accessMode = resolveMvpAccessMode({ env });

    if (integration.status !== "ready") {
        return {
            status: "blocked",
            summary: "Platform activation is still blocked by prerequisite env or connectivity gaps. Leave the MVP gate off.",
            missingEnv: [],
            warnings: [],
            details: {
                gateRequested: explicitGate === true,
                anonymousRequested,
                gateStatus: accessMode.status,
                gateEnabled: accessMode.gateEnabled,
                gateMisconfigured: accessMode.misconfigured,
                gateBypassed: accessMode.bypassed,
            },
            probe: createSkippedProbe("Live rollout certification is deferred until auth, database, billing, and integration are green."),
        };
    }

    if (explicitGate === true && anonymousRequested) {
        return {
            status: "blocked",
            summary: "MVP gate rollout is unsafe because anonymous bypass is still requested.",
            missingEnv: [],
            warnings: ["Unset GAUSET_ALLOW_ANONYMOUS_MVP before treating the MVP workspace as entitlement-gated."],
            details: {
                gateRequested: true,
                anonymousRequested: true,
                gateStatus: accessMode.status,
                gateEnabled: accessMode.gateEnabled,
                gateMisconfigured: accessMode.misconfigured,
                gateBypassed: accessMode.bypassed,
            },
            probe: createSkippedProbe("Anonymous-bypass cleanup is required before live rollout certification."),
        };
    }

    if (explicitGate !== true) {
        return {
            status: "partial",
            summary: "Core prerequisites are green, but the MVP gate is intentionally still off pending a live-cert thread.",
            missingEnv: [],
            warnings: ["This snapshot does not prove live-route, authenticated-session, or Stripe webhook certification."],
            details: {
                gateRequested: false,
                anonymousRequested,
                gateStatus: accessMode.status,
                gateEnabled: accessMode.gateEnabled,
                gateMisconfigured: accessMode.misconfigured,
                gateBypassed: accessMode.bypassed,
            },
            probe: createSkippedProbe("Run the live rollout certification lane before enabling GAUSET_ENABLE_PLATFORM_MVP_GATE."),
        };
    }

    return {
        status: "partial",
        summary: "The gate is explicitly requested and prereqs are green, but live staging certification is still required before activation is complete.",
        missingEnv: [],
        warnings: ["Validate live route protection, authenticated API flows, and staged E2E coverage on a merge/live-cert thread."],
        details: {
            gateRequested: true,
            anonymousRequested: false,
            gateStatus: accessMode.status,
            gateEnabled: accessMode.gateEnabled,
            gateMisconfigured: accessMode.misconfigured,
            gateBypassed: accessMode.bypassed,
        },
        probe: createSkippedProbe("Local repo truth is green, but deployed-stack certification is still pending."),
    };
}

function buildCapabilityAssessments({
    auth,
    database,
    billing,
    integration,
    rollout,
}: {
    auth: ActivationReadinessSection;
    database: ActivationReadinessSection;
    billing: ActivationReadinessSection;
    integration: ActivationReadinessSection;
    rollout: ActivationReadinessSection;
}): ActivationCapabilityAssessment[] {
    const authOperational = auth.status === "ready";
    const databaseOperational = database.status === "ready";
    const billingOperational = billing.status === "ready";
    const integrationOperational = integration.status === "ready";
    const rolloutGateEnabled = readBooleanDetail(rollout, "gateEnabled");

    return [
        createCapabilityAssessment({
            capability: "auth",
            classification: authOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: authOperational,
            requiresLiveCertification: true,
            summary: authOperational
                ? "Supabase login, registration, OAuth redirect, invitation acceptance, and session bootstrap are wired, with local structural and gate coverage. Live auth proof still depends on authenticated runtime certification."
                : "Auth routes and session bootstrap code are landed, but env/config still prevents operational activation.",
            blockers: auth.missingEnv,
            evidence: [
                "src/app/api/auth/login/route.ts",
                "src/app/api/auth/register/route.ts",
                "src/app/api/auth/session/route.ts",
                "src/server/auth/session.ts",
            ],
            verification: ["npm run test:platform-release-gates", "npm run test:platform-readiness", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "sessions",
            classification:
                authOperational && databaseOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: authOperational && databaseOperational,
            requiresLiveCertification: true,
            summary:
                authOperational && databaseOperational
                    ? "Tracked platform sessions, revoke flows, and session inventory are implemented against platform storage."
                    : "Tracked session code is present, but it depends on auth and platform REST configuration being truly online.",
            blockers: dedupeStrings([
                ...auth.missingEnv,
                ...database.missingEnv,
                authOperational && databaseOperational ? null : "Tracked platform sessions require working auth cookies plus platform REST access.",
            ]),
            evidence: [
                "src/server/auth/platform-sessions.ts",
                "src/server/auth/session.ts",
                "src/app/api/auth/session/route.ts",
                "tests/platform/authenticated-platform.spec.ts",
            ],
            verification: ["npm run test:platform-contracts", "npm run test:platform-routes", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "billing",
            classification: billingOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: billingOperational,
            requiresLiveCertification: true,
            summary:
                billingOperational
                    ? "Stripe checkout, portal, summary, reconciliation, usage, and webhook ingestion are landed, with local structural and gate coverage. Live Stripe delivery proof still depends on webhook/runtime certification."
                    : "Billing and Stripe server routes are landed, but Stripe env/config or live delivery verification is still incomplete.",
            blockers: dedupeStrings([...billing.missingEnv, ...(billing.probe?.status === "blocked" ? ["Stripe API connectivity is still failing."] : [])]),
            evidence: [
                "src/app/api/billing/checkout/route.ts",
                "src/app/api/billing/portal/route.ts",
                "src/app/api/billing/summary/route.ts",
                "src/server/billing/webhooks.ts",
                "supabase/migrations/20260315170500_billing_completion.sql",
                "supabase/migrations/20260315193000_billing_usage_events.sql",
            ],
            verification: ["npm run test:platform-release-gates", "npm run test:platform-readiness", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "entitlements_and_gated_mvp_access",
            classification:
                integration.status !== "ready"
                    ? "implemented_but_not_operational"
                    : rollout.status === "blocked"
                      ? "regression_risk_area"
                      : rolloutGateEnabled
                        ? "implemented_and_verified"
                        : "intentionally_unavailable",
            operational: integrationOperational && rollout.status !== "blocked",
            requiresLiveCertification: true,
            summary:
                integration.status !== "ready"
                    ? "Entitlement-aware MVP gating is coded, but auth/database/billing are not all green yet."
                    : rollout.status === "blocked"
                      ? "MVP gate rollout is in a risky state and should not be treated as activation-ready."
                      : rolloutGateEnabled
                        ? "MVP access is explicitly gated by entitlement logic and local contract tests."
                        : "MVP gating is intentionally held off until the merge/live-cert thread proves staging readiness.",
            blockers: dedupeStrings([
                ...(integrationOperational ? [] : ["Auth, database, and billing all need to be green before entitlement gating can activate."]),
                ...(rollout.status === "blocked" ? [rollout.summary] : []),
            ]),
            evidence: [
                "src/server/mvp/access-gate.ts",
                "src/server/mvp/access.ts",
                "src/app/mvp/page.tsx",
                "tests/platform/mvp-entitlement.spec.ts",
            ],
            verification: ["npm run test:platform-contracts", "npm run test:platform-readiness", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "studios_and_workspaces",
            classification:
                authOperational && databaseOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: authOperational && databaseOperational,
            requiresLiveCertification: true,
            summary:
                authOperational && databaseOperational
                    ? "Studio selection, invitations, workspace state, and account shell surfaces are landed and locally wired."
                    : "Workspace code is present, but live auth/database prerequisites still block operational verification.",
            blockers: dedupeStrings([...auth.missingEnv, ...database.missingEnv]),
            evidence: [
                "src/app/(app)/layout.tsx",
                "src/app/api/auth/finalize-invite/route.ts",
                "src/server/auth/session.ts",
                "supabase/migrations/20260312233000_active_studio_selection.sql",
            ],
            verification: ["npm run test:platform-routes", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "projects_and_world_links",
            classification:
                authOperational && databaseOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: authOperational && databaseOperational,
            requiresLiveCertification: true,
            summary:
                authOperational && databaseOperational
                    ? "Project CRUD, activity, world links, review-share hooks, and scene-ownership logic are landed."
                    : "Project and world-link services exist, but they still depend on the platform auth/database stack being online.",
            blockers: dedupeStrings([...auth.missingEnv, ...database.missingEnv]),
            evidence: [
                "src/app/api/projects/route.ts",
                "src/app/api/projects/[projectId]/world-links/route.ts",
                "src/server/projects/service.ts",
                "src/server/projects/ownership.ts",
            ],
            verification: ["npm run test:platform-routes", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "admin_and_account_platform",
            classification:
                authOperational && databaseOperational ? "implemented_and_verified" : "implemented_but_not_operational",
            operational: authOperational && databaseOperational,
            requiresLiveCertification: true,
            summary:
                authOperational && databaseOperational
                    ? "Account settings, security sessions, workspace shell, and admin account/billing surfaces are landed in the repo."
                    : "The account/admin platform surfaces are implemented, but operational rollout still depends on the same auth/database readiness.",
            blockers: dedupeStrings([...auth.missingEnv, ...database.missingEnv]),
            evidence: [
                "src/app/(app)/app/settings/profile/page.tsx",
                "src/app/(app)/app/settings/security/page.tsx",
                "src/app/(admin)/admin/accounts/page.tsx",
                "src/app/(admin)/admin/billing/page.tsx",
            ],
            verification: ["npm run test:platform-routes", "npm run typecheck"],
        }),
        createCapabilityAssessment({
            capability: "staging_and_platform_activation",
            classification:
                rollout.status === "blocked"
                    ? "regression_risk_area"
                    : rollout.status === "partial"
                      ? "implemented_but_not_operational"
                      : "implemented_and_verified",
            operational: false,
            requiresLiveCertification: true,
            summary: "Local repo truth is strong, but deployed-stack activation still requires a merge/live-cert thread for route, auth, webhook, and E2E proof.",
            blockers: dedupeStrings([
                rollout.summary,
                "Live route protection, authenticated staging APIs, Stripe webhook delivery, and Playwright staging certification were not run in this thread.",
            ]),
            evidence: [
                "src/server/platform/activation-readiness.ts",
                "src/app/api/platform/readiness/route.ts",
                "playwright.platform.config.ts",
                "scripts/test_platform_release_gates.mjs",
                "scripts/test_platform_live_routes.mjs",
                "scripts/test_platform_authenticated_api.mjs",
                "scripts/certify_platform_rollout.mjs",
            ],
            verification: [
                "npm run diagnose:platform-readiness",
                "npm run test:platform-release-gates",
                "npm run test:platform-routes",
                "npm run test:platform-readiness",
            ],
        }),
    ];
}

function buildActions(
    snapshot: Pick<
        PlatformActivationReadinessSnapshot,
        "auth" | "database" | "billing" | "migrations" | "integration" | "rollout" | "capabilities"
    >,
) {
    const actions: string[] = [];
    if (snapshot.auth.missingEnv.length > 0) {
        actions.push(`Set auth env vars: ${snapshot.auth.missingEnv.join(", ")}.`);
    }
    if (snapshot.database.missingEnv.length > 0) {
        actions.push(`Set platform Supabase env vars: ${snapshot.database.missingEnv.join(", ")}.`);
    }
    if (snapshot.database.warnings.some((warning) => warning.includes("Direct DATABASE_URL"))) {
        actions.push("Do not rely on DATABASE_URL alone in this repo. Current platform services require Supabase REST credentials.");
    }
    if (snapshot.billing.missingEnv.length > 0) {
        actions.push(`Set billing env vars: ${snapshot.billing.missingEnv.join(", ")}.`);
    }
    if (snapshot.database.probe?.status === "blocked") {
        actions.push("Apply Supabase migrations to staging and verify the service role can read platform tables.");
    }
    if (snapshot.billing.probe?.status === "blocked") {
        actions.push("Verify the Stripe test secret, API version, and webhook secret in staging.");
    }
    if (snapshot.integration.status !== "ready") {
        actions.push("Keep GAUSET_ENABLE_PLATFORM_MVP_GATE disabled until auth, database, and billing are all green.");
    }
    if (snapshot.rollout.status === "blocked" && readBooleanDetail(snapshot.rollout, "gateRequested")) {
        actions.push("Disable GAUSET_ENABLE_PLATFORM_MVP_GATE until the readiness route is green and the live-cert lane is complete.");
    }
    if (snapshot.rollout.status === "blocked" && readBooleanDetail(snapshot.rollout, "anonymousRequested")) {
        actions.push("Unset GAUSET_ALLOW_ANONYMOUS_MVP before calling the MVP workspace entitlement-gated.");
    }
    if (snapshot.rollout.status === "partial") {
        actions.push("Run live route, authenticated API, Stripe webhook, and staging E2E certification on the merge/live-cert thread before enabling the MVP gate.");
    }
    return actions;
}

export function canExposePlatformReadiness(env: NodeJS.ProcessEnv = process.env) {
    return env.NODE_ENV !== "production" || env.GAUSET_EXPOSE_PLATFORM_READINESS === "1";
}

export async function getPlatformActivationReadiness(
    options: PlatformActivationReadinessOptions = {},
): Promise<PlatformActivationReadinessSnapshot> {
    const env = options.env ?? process.env;
    const includeConnectivity = options.includeConnectivity ?? false;
    const migrationDirectory = options.migrationDirectory ?? path.join(process.cwd(), "supabase", "migrations");

    const [auth, database, billing, migrations] = await Promise.all([
        buildAuthSection(env),
        buildDatabaseSection({ env, includeConnectivity }),
        buildBillingSection({ env, includeConnectivity }),
        buildMigrationSection(migrationDirectory),
    ]);
    const integration = buildIntegrationSection({ auth, database, billing });
    const rollout = buildRolloutSection({ env, integration });
    const capabilities = buildCapabilityAssessments({
        auth,
        database,
        billing,
        integration,
        rollout,
    });

    const baseSnapshot = {
        auth,
        database,
        billing,
        migrations,
        integration,
        rollout,
        capabilities,
    };

    return {
        checkedAt: new Date().toISOString(),
        status: resolveSectionStatus([auth.status, database.status, billing.status, migrations.status, integration.status]),
        activationStatus: resolveSectionStatus([auth.status, database.status, billing.status, migrations.status, integration.status, rollout.status]),
        ...baseSnapshot,
        actions: buildActions(baseSnapshot),
    };
}
