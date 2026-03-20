import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";

import { canAccessAdminConsole } from "./access";

export async function getAdminApiSession() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return {
            session: null,
            response: NextResponse.json({ message: "Authentication required." }, { status: 401 }),
        };
    }

    const allowed = await canAccessAdminConsole(session);
    if (!allowed) {
        return {
            session: null,
            response: NextResponse.json({ message: "Admin access required." }, { status: 403 }),
        };
    }

    return {
        session,
        response: null,
    };
}
