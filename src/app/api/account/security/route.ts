import { NextResponse } from "next/server";

import { getSecurityOverviewForSession } from "@/server/account/security";
import { getCurrentAuthSession } from "@/server/auth/session";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const security = await getSecurityOverviewForSession(session);
    return NextResponse.json({ security });
}
