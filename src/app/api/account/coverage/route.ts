import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getCoordinationSnapshotForSession(session);
    return NextResponse.json({ coverage: snapshot.coverage });
}
