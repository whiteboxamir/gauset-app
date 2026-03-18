import { redirect } from "next/navigation";

import type { AuthSession } from "@/server/contracts/auth";

import { canAccessAdminConsole } from "@/server/admin/access";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getCurrentAuthSession } from "@/server/auth/session";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";
import { isMvpAccessControlBypassed, resolveMvpAccessMode, resolveMvpWorkspaceAccessDecision } from "@/server/mvp/access-gate";
import { ensureSceneOwnershipForSession } from "@/server/projects/ownership";

export { extractSceneIdFromProxyPath, extractSceneIdFromProxyResponse } from "@/server/mvp/proxyScene";
export { isMvpAccessControlBypassed, resolveMvpAccessMode, resolveMvpWorkspaceAccessDecision } from "@/server/mvp/access-gate";

interface AccountFlagRow {
    id: string;
    flag_value: unknown;
    expires_at: string | null;
    created_at: string;
}

interface FeatureFlagRow {
    id: string;
    enabled: boolean;
    created_at: string;
}

function isTruthyFlagValue(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value === "true" || value === "1";
    }
    if (typeof value === "number") {
        return value === 1;
    }
    if (typeof value === "object" && value !== null && "enabled" in value) {
        return Boolean((value as { enabled?: unknown }).enabled);
    }
    return false;
}

async function resolveLatestAccountFlagValue(session: AuthSession, flagKey: string) {
    if (!isPlatformDatabaseConfigured()) {
        return null as boolean | null;
    }

    const now = Date.now();
    const [userFlags, studioFlags] = await Promise.all([
        restSelect<AccountFlagRow[]>("account_flags", {
            select: "id,flag_value,expires_at,created_at",
            filters: {
                flag_key: `eq.${flagKey}`,
                user_id: `eq.${session.user.userId}`,
                order: "created_at.desc",
                limit: "10",
            },
        }),
        session.activeStudioId
            ? restSelect<AccountFlagRow[]>("account_flags", {
                  select: "id,flag_value,expires_at,created_at",
                  filters: {
                      flag_key: `eq.${flagKey}`,
                      studio_id: `eq.${session.activeStudioId}`,
                      order: "created_at.desc",
                      limit: "10",
                  },
              })
            : Promise.resolve([] as AccountFlagRow[]),
    ]);

    const selectValue = (rows: AccountFlagRow[]) =>
        rows.find((row) => !row.expires_at || Date.parse(row.expires_at) >= now);

    const userFlag = selectValue(userFlags);
    if (userFlag) {
        return isTruthyFlagValue(userFlag.flag_value);
    }

    const studioFlag = selectValue(studioFlags);
    if (studioFlag) {
        return isTruthyFlagValue(studioFlag.flag_value);
    }

    return null;
}

async function resolveLatestFeatureFlagValue(session: AuthSession, flagKey: string) {
    if (!isPlatformDatabaseConfigured()) {
        return null as boolean | null;
    }

    const [userFlags, studioFlags, globalFlags] = await Promise.all([
        restSelect<FeatureFlagRow[]>("feature_flags", {
            select: "id,enabled,created_at",
            filters: {
                flag_key: `eq.${flagKey}`,
                scope_type: "eq.user",
                user_id: `eq.${session.user.userId}`,
                order: "created_at.desc",
                limit: "1",
            },
        }),
        session.activeStudioId
            ? restSelect<FeatureFlagRow[]>("feature_flags", {
                  select: "id,enabled,created_at",
                  filters: {
                      flag_key: `eq.${flagKey}`,
                      scope_type: "eq.studio",
                      studio_id: `eq.${session.activeStudioId}`,
                      order: "created_at.desc",
                      limit: "1",
                  },
              })
            : Promise.resolve([] as FeatureFlagRow[]),
        restSelect<FeatureFlagRow[]>("feature_flags", {
            select: "id,enabled,created_at",
            filters: {
                flag_key: `eq.${flagKey}`,
                scope_type: "eq.global",
                order: "created_at.desc",
                limit: "1",
            },
        }),
    ]);

    return userFlags[0]?.enabled ?? studioFlags[0]?.enabled ?? globalFlags[0]?.enabled ?? null;
}

export async function canSessionAccessMvp(session: AuthSession) {
    if (isMvpAccessControlBypassed()) {
        return true;
    }

    if (await canAccessAdminConsole(session)) {
        return true;
    }

    const accountFlag = await resolveLatestAccountFlagValue(session, "mvp_access");
    if (accountFlag !== null) {
        return accountFlag;
    }

    const featureFlag = await resolveLatestFeatureFlagValue(session, "mvp_access");
    if (featureFlag !== null) {
        return featureFlag;
    }

    return session.entitlements.canAccessMvp;
}

export async function requireMvpWorkspaceAccess(nextPath = "/mvp") {
    const safeNextPath = sanitizeNextPath(nextPath, "/mvp");
    const accessMode = resolveMvpAccessMode();
    if (accessMode.bypassed) {
        return null;
    }

    if (accessMode.misconfigured) {
        throw new Error("MVP access gate is enabled, but platform auth, database, and billing are not all operational.");
    }

    const session = await getCurrentAuthSession();
    if (!session) {
        redirect(`/auth/login?next=${encodeURIComponent(safeNextPath)}`);
    }

    const entitled = await canSessionAccessMvp(session);
    const decision = resolveMvpWorkspaceAccessDecision({
        gateEnabled: accessMode.gateEnabled,
        misconfigured: accessMode.misconfigured,
        anonymousAllowed: accessMode.anonymousAllowed,
        hasSession: true,
        entitled,
    });

    if (!decision.allowed && decision.reason === "gate_misconfigured") {
        throw new Error("MVP access gate is enabled, but platform auth, database, and billing are not all operational.");
    }

    if (!decision.allowed && decision.reason === "billing_required") {
        redirect("/app/billing?checkout=required");
    }

    return session;
}

export async function ensureSessionSceneAccess({
    session,
    sceneId,
    sourceLabel,
}: {
    session: AuthSession;
    sceneId: string;
    sourceLabel?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return {
            sceneId,
            projectId: null,
            created: false,
            linkedElsewhere: false,
        };
    }

    if (await canAccessAdminConsole(session)) {
        return {
            sceneId,
            projectId: null,
            created: false,
            linkedElsewhere: false,
        };
    }

    return ensureSceneOwnershipForSession({
        session,
        sceneId,
        sourceLabel,
    });
}

export async function getMvpProxySession() {
    const accessMode = resolveMvpAccessMode();
    if (accessMode.bypassed) {
        return null;
    }

    if (accessMode.misconfigured) {
        return null;
    }

    const session = await getCurrentAuthSession();
    if (!session) {
        return null;
    }

    return session;
}
