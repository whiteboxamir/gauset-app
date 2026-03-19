import { redirect } from "next/navigation";

import { sanitizeNextPath } from "@/server/auth/redirects";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; email?: string }>;
}) {
    const params = await searchParams;
    const nextPath = sanitizeNextPath(params.next, "/app/worlds");
    const redirectParams = new URLSearchParams({
        next: nextPath,
    });
    const email = params.email?.trim();
    if (email) {
        redirectParams.set("email", email);
    }

    redirect(`/auth/login?${redirectParams.toString()}`);
}
