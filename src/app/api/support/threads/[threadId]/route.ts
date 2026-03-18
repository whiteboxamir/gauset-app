import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getSupportThreadDetailForSession } from "@/server/support/service";

export async function GET(_request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const { threadId } = await context.params;
    const thread = await getSupportThreadDetailForSession(session, threadId);
    if (!thread) {
        return NextResponse.json({ message: "Support thread not found." }, { status: 404 });
    }

    return NextResponse.json({ thread });
}
