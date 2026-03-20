import { NextRequest, NextResponse } from "next/server";

import { coverageOperatorMutationSchema } from "@/server/contracts/coverage";
import { getCurrentAuthSession } from "@/server/auth/session";
import { updateOperatorCoverageForSession } from "@/server/platform/coverage";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { userId } = await context.params;
        const mutation = coverageOperatorMutationSchema.parse(await request.json());

        await updateOperatorCoverageForSession({
            session,
            userId,
            mutation,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update operator coverage.",
            },
            { status: 400 },
        );
    }
}
