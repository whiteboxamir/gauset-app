"use client";

import { useState } from "react";

export function LogoutButton() {
    const [pending, setPending] = useState(false);

    return (
        <button
            type="button"
            onClick={async () => {
                if (pending) {
                    return;
                }

                setPending(true);
                try {
                    const response = await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "same-origin",
                    });
                    const payload = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
                    window.location.assign(response.ok ? payload?.redirectTo ?? "/auth/login" : "/auth/login");
                } finally {
                    setPending(false);
                }
            }}
            disabled={pending}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
        >
            {pending ? "Logging out..." : "Log out"}
        </button>
    );
}
