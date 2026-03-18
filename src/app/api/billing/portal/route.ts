import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createPortalSessionForStudio } from "@/server/billing/portal";
import { describeBillingError } from "@/server/billing/errors";
import { getCurrentAuthSession } from "@/server/auth/session";
import { sanitizeNextPath } from "@/server/auth/redirects";

const portalSchema = z.object({
    returnPath: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = portalSchema.parse(await request.json().catch(() => ({})));
        const portal = await createPortalSessionForStudio({
            session,
            origin: request.nextUrl.origin,
            returnPath: sanitizeNextPath(payload.returnPath, "/app/billing"),
        });

        return NextResponse.json({
            mode: "portal",
            url: portal.url,
            id: portal.id,
        });
    } catch (error) {
        const failure = describeBillingError(error, "Unable to open billing portal.");
        return NextResponse.json(
            {
                code: failure.code,
                message: failure.message,
            },
            { status: failure.status },
        );
    }
}
