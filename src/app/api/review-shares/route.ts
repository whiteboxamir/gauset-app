import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { createReviewShareRequestSchema } from "@/server/contracts/review-shares";
import { canUseLocalhostMvpBypass } from "@/server/mvp/hostPolicy";
import { canSessionAccessMvp, isMvpAccessControlBypassed } from "@/server/mvp/access";
import {
    createLocalhostReviewShareResponse,
    createReviewShareForSession,
    getReviewShareErrorStatus,
    isReviewShareSigningConfigured,
} from "@/server/review-shares/service";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    const shouldUseLocalhostFallback =
        !session &&
        canUseLocalhostMvpBypass({
            bypassActive: isMvpAccessControlBypassed(),
            forwardedHost: request.headers.get("x-forwarded-host"),
            hostHeader: request.headers.get("host"),
            urlHostname: request.nextUrl.hostname,
        });

    if (!session && !shouldUseLocalhostFallback) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = createReviewShareRequestSchema.parse(await request.json());

        if (shouldUseLocalhostFallback) {
            return NextResponse.json(
                createLocalhostReviewShareResponse({
                    origin: request.nextUrl.origin,
                    payload,
                }),
            );
        }

        if (!session) {
            return NextResponse.json({ message: "Authentication required." }, { status: 401 });
        }

        if (!(await canSessionAccessMvp(session))) {
            return NextResponse.json({ message: "Current account is not entitled to MVP review sharing." }, { status: 403 });
        }

        if (!isReviewShareSigningConfigured()) {
            return NextResponse.json(
                { message: "Secure review sharing is not configured for this deployment." },
                { status: 503 },
            );
        }

        const share = await createReviewShareForSession({
            session,
            origin: request.nextUrl.origin,
            payload,
        });
        await syncPlatformNotificationsAfterMutation(session);
        return NextResponse.json(share);
    } catch (error) {
        return NextResponse.json(
            {
                message: error instanceof Error ? error.message : "Unable to create secure review share.",
            },
            { status: getReviewShareErrorStatus(error) },
        );
    }
}
