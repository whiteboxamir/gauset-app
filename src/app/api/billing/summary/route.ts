import { NextResponse } from "next/server";

import { getBillingOverviewForSession } from "@/server/billing/summary";
import { getCurrentAuthSession } from "@/server/auth/session";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const overview = await getBillingOverviewForSession(session);
    return NextResponse.json(overview);
}
