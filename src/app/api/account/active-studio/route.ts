import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStudioWorkspaceStateForSession, setActiveStudioForSession } from "@/server/account/workspaces";
import { getCurrentAuthSession } from "@/server/auth/session";

const activeStudioSchema = z.object({
    studioId: z.string().uuid(),
});

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = activeStudioSchema.parse(await request.json());
        const activeStudio = await setActiveStudioForSession({
            session,
            studioId: payload.studioId,
        });
        const workspaceState = await getStudioWorkspaceStateForSession({
            ...session,
            activeStudioId: activeStudio.studioId,
        });

        return NextResponse.json({
            success: true,
            activeStudio,
            accessibleStudios: workspaceState.accessibleStudios,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to switch workspace.",
            },
            { status: 400 },
        );
    }
}
