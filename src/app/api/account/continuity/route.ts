import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getContinuitySnapshotForSession } from "@/server/platform/continuity";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getContinuitySnapshotForSession(session);
    return NextResponse.json({ continuity: snapshot });
}
