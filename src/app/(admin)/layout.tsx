import type { ReactNode } from "react";

import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/EmptyState";
import type { PlatformNavGroup } from "@/components/platform/Sidebar";

const adminNavGroups: PlatformNavGroup[] = [
    {
        label: "Operations",
        items: [
            { href: "/admin/accounts", label: "Accounts" },
            { href: "/admin/billing", label: "Billing" },
            { href: "/admin/support", label: "Support" },
            { href: "/admin/flags", label: "Flags" },
        ],
    },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <AppShell
            navGroups={adminNavGroups}
            accountLabel="Internal"
            environmentLabel="Admin shell"
            eyebrow="Operations"
            title="Platform operations"
            subtitle="Internal account health, billing overrides, support, and feature flag controls live in this isolated admin surface."
            statusLabel="Internal"
        >
            {children ?? (
                <EmptyState
                    eyebrow="Reserved surface"
                    title="Admin routes will mount here"
                    body="Keep admin and support tooling out of the product shell so partner-facing work stays clean."
                />
            )}
        </AppShell>
    );
}
