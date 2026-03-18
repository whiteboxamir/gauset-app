import type { NextRequest } from "next/server";

import { canAccessAdminConsole } from "@/server/admin/access";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getCurrentAuthSession } from "@/server/auth/session";
import {
    canSessionAccessMvp,
    ensureSessionSceneAccess,
    extractSceneIdFromProxyResponse,
    isMvpAccessControlBypassed,
    resolveMvpAccessMode,
} from "@/server/mvp/access";
import {
    buildAccessDeniedResponse,
    extractJsonResponsePayload,
    extractSceneIdFromRequestPayload,
    extractSourceLabelFromRequestPayload,
    isPublicProxyPath,
    parseJsonBody,
    type ProxyAccessContext,
} from "@/server/mvp/proxyShared";
import { resolveSceneOwnershipForSession } from "@/server/projects/ownership";
import { authorizeReviewShareToken } from "@/server/review-shares/service";

export async function authorizeProxyRequest({
    request,
    pathname,
    bodyBuffer,
}: {
    request: NextRequest;
    pathname: string;
    bodyBuffer?: ArrayBuffer;
}) {
    const requestPayload = parseJsonBody(request.headers.get("content-type"), bodyBuffer);
    const requestSceneId = extractSceneIdFromRequestPayload(pathname, requestPayload);
    const requestSourceLabel = extractSourceLabelFromRequestPayload(requestPayload);
    const reviewShareToken = request.nextUrl.searchParams.get("share");
    const accessMode = resolveMvpAccessMode();
    const reviewShareAccess =
        reviewShareToken && !accessMode.bypassed
            ? await authorizeReviewShareToken({
                  token: reviewShareToken,
                  pathname,
                  method: request.method,
              })
            : null;

    if (accessMode.misconfigured && !isPublicProxyPath(pathname, request.method) && !reviewShareAccess) {
        return buildAccessDeniedResponse({
            pathname,
            status: 503,
            code: "MVP_GATE_UNAVAILABLE",
            message: "MVP access is temporarily unavailable while the platform gate configuration is incomplete.",
        });
    }

    if (isPublicProxyPath(pathname, request.method) || isMvpAccessControlBypassed() || reviewShareAccess) {
        return {
            isAdmin: false,
            requestSceneId,
            requestSourceLabel,
            session: reviewShareAccess ? null : await getCurrentAuthSession(),
        } satisfies ProxyAccessContext;
    }

    const session = await getCurrentAuthSession();
    if (!session) {
        return buildAccessDeniedResponse({
            pathname,
            status: 401,
            code: "AUTH_REQUIRED",
            message: "Sign in to use the MVP workspace.",
            redirectTo: `/auth/login?next=${encodeURIComponent(sanitizeNextPath(request.nextUrl.pathname, "/mvp"))}`,
        });
    }

    if (!(await canSessionAccessMvp(session))) {
        return buildAccessDeniedResponse({
            pathname,
            status: 403,
            code: "MVP_ACCESS_REQUIRED",
            message: "Your current plan does not include MVP workspace access.",
            redirectTo: "/app/billing?checkout=required",
        });
    }

    const isAdmin = await canAccessAdminConsole(session);
    if (requestSceneId && !isAdmin) {
        const resolution = await resolveSceneOwnershipForSession(session, requestSceneId);
        if (resolution.linkedElsewhere) {
            return buildAccessDeniedResponse({
                pathname,
                status: 403,
                code: "SCENE_ACCESS_DENIED",
                message: `Scene ${requestSceneId} is already linked to another account.`,
                redirectTo: "/app/worlds",
            });
        }
    }

    return {
        isAdmin,
        requestSceneId,
        requestSourceLabel,
        session,
    } satisfies ProxyAccessContext;
}

export async function ensureProxyResponseSceneAccess({
    pathname,
    upstream,
    accessContext,
}: {
    pathname: string;
    upstream: Response;
    accessContext: ProxyAccessContext;
}) {
    if (!upstream.ok || !accessContext.session || accessContext.isAdmin) {
        return null;
    }

    let resolvedSceneId = accessContext.requestSceneId;
    if (!resolvedSceneId) {
        const payload = await extractJsonResponsePayload(upstream);
        if (payload) {
            resolvedSceneId = extractSceneIdFromProxyResponse(pathname, payload);
        }
    }

    if (!resolvedSceneId) {
        return null;
    }

    try {
        const ownership = await ensureSessionSceneAccess({
            session: accessContext.session,
            sceneId: resolvedSceneId,
            sourceLabel: accessContext.requestSourceLabel,
        });

        if (ownership.linkedElsewhere) {
            return buildAccessDeniedResponse({
                pathname,
                status: 403,
                code: "SCENE_ACCESS_DENIED",
                message: `Scene ${resolvedSceneId} is already linked to another account.`,
                redirectTo: "/app/worlds",
            });
        }

        return null;
    } catch (error) {
        return buildAccessDeniedResponse({
            pathname,
            status: 500,
            code: "SCENE_OWNERSHIP_SYNC_FAILED",
            message: error instanceof Error ? error.message : "Scene ownership could not be synchronized.",
            redirectTo: "/app/worlds",
        });
    }
}
