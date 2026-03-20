import { redirect } from "next/navigation";

import type { AuthSession } from "@/server/contracts/auth";

import { getCurrentAuthSession } from "@/server/auth/session";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";

import { getAdminConfig } from "./config";

interface AccountFlagRow {
    id: string;
    flag_value: unknown;
    expires_at: string | null;
}

function isTruthyFlagValue(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value === "true" || value === "1";
    }
    if (typeof value === "object" && value !== null && "enabled" in value) {
        return Boolean((value as { enabled?: unknown }).enabled);
    }
    return false;
}

async function hasAdminOverrideFlag(session: AuthSession) {
    if (!isPlatformDatabaseConfigured()) {
        return false;
    }

    const orClauses = [`user_id.eq.${session.user.userId}`];
    if (session.activeStudioId) {
        orClauses.push(`studio_id.eq.${session.activeStudioId}`);
    }

    const rows = await restSelect<AccountFlagRow[]>("account_flags", {
        select: "id,flag_value,expires_at",
        filters: {
            flag_key: "eq.admin_console",
            or: `(${orClauses.join(",")})`,
            order: "created_at.desc",
            limit: "10",
        },
    });

    const now = Date.now();
    return rows.some((row) => {
        if (row.expires_at && Date.parse(row.expires_at) < now) {
            return false;
        }
        return isTruthyFlagValue(row.flag_value);
    });
}

export async function canAccessAdminConsole(session: AuthSession) {
    const adminConfig = getAdminConfig();
    if (adminConfig.allowedEmails.includes(session.user.email.toLowerCase())) {
        return true;
    }
    if (session.entitlements.canUseAdminConsole) {
        return true;
    }
    return hasAdminOverrideFlag(session);
}

export async function requireAdminSession(nextPath = "/admin/accounts") {
    const session = await getCurrentAuthSession();
    if (!session) {
        redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }

    const allowed = await canAccessAdminConsole(session);
    if (!allowed) {
        redirect("/app/dashboard");
    }

    return session;
}
