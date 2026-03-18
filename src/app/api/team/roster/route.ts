import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getTeamRosterForSession } from "@/server/team/service";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const roster = await getTeamRosterForSession(session);
    return NextResponse.json({ roster });
}
