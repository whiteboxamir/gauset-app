import { redirect } from "next/navigation";

import { sanitizeNextPath } from "./redirects.ts";
import { getCurrentAuthSession } from "./session.ts";

export async function requireAuthSession(nextPath = "/app/dashboard") {
    const session = await getCurrentAuthSession();
    if (!session) {
        redirect(`/auth/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`);
    }
    return session;
}
