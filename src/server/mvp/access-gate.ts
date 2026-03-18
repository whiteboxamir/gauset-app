import { getAuthConfig } from "../auth/config.ts";
import { getBillingConfig } from "../billing/config.ts";
import { isPlatformDatabaseConfigured } from "../db/client.ts";

function normalizeBoolString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export function parseExplicitPlatformBool(value?: string | null) {
    const normalized = normalizeBoolString(value);
    if (!normalized) return null;
    if (normalized === "1" || normalized.toLowerCase() === "true") return true;
    if (normalized === "0" || normalized.toLowerCase() === "false") return false;
    return null;
}

function hasOperationalAuthConfig(env: NodeJS.ProcessEnv) {
    const config = getAuthConfig(env);
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.serviceRoleKey && config.appUrl);
}

function hasOperationalBillingConfig(env: NodeJS.ProcessEnv) {
    const config = getBillingConfig(env);
    return Boolean(config.stripeSecretKey && config.stripeWebhookSecret && config.appUrl);
}

export function resolveMvpAccessMode({
    env = process.env,
    databaseConfigured = isPlatformDatabaseConfigured(env),
    authConfigured = hasOperationalAuthConfig(env),
    billingConfigured = hasOperationalBillingConfig(env),
}: {
    env?: NodeJS.ProcessEnv;
    databaseConfigured?: boolean;
    authConfigured?: boolean;
    billingConfigured?: boolean;
} = {}) {
    const explicitGate = parseExplicitPlatformBool(env.GAUSET_ENABLE_PLATFORM_MVP_GATE);
    const requirementsReady = databaseConfigured && authConfigured && billingConfigured;
    const gateEnabled = explicitGate === true && requirementsReady;
    const misconfigured = explicitGate === true && !requirementsReady;
    const anonymousAllowed = gateEnabled && parseExplicitPlatformBool(env.GAUSET_ALLOW_ANONYMOUS_MVP) === true;
    const status = misconfigured ? "misconfigured" : anonymousAllowed ? "anonymous" : gateEnabled ? "enforced" : "disabled";

    return {
        status,
        gateEnabled,
        misconfigured,
        anonymousAllowed,
        bypassed: explicitGate !== true || anonymousAllowed,
    };
}

export type MvpWorkspaceAccessReason = "bypassed" | "entitled" | "auth_required" | "billing_required" | "gate_misconfigured";

export function resolveMvpWorkspaceAccessDecision({
    gateEnabled,
    misconfigured,
    anonymousAllowed,
    hasSession,
    entitled,
}: {
    gateEnabled: boolean;
    misconfigured?: boolean;
    anonymousAllowed: boolean;
    hasSession: boolean;
    entitled: boolean;
}): {
    allowed: boolean;
    reason: MvpWorkspaceAccessReason;
} {
    if (misconfigured) {
        return {
            allowed: false,
            reason: "gate_misconfigured",
        };
    }

    if (!gateEnabled || anonymousAllowed) {
        return {
            allowed: true,
            reason: "bypassed",
        };
    }

    if (!hasSession) {
        return {
            allowed: false,
            reason: "auth_required",
        };
    }

    if (!entitled) {
        return {
            allowed: false,
            reason: "billing_required",
        };
    }

    return {
        allowed: true,
        reason: "entitled",
    };
}

export function isMvpAccessControlBypassed(env: NodeJS.ProcessEnv = process.env) {
    return resolveMvpAccessMode({ env }).bypassed;
}
