"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

type FeatureFlagCatalogItem = {
    key: string;
    title: string;
    description: string;
    owner: string;
    stage: string;
};

export function AdminFeatureFlagForm({
    catalog,
}: {
    catalog: FeatureFlagCatalogItem[];
}) {
    const router = useRouter();
    const [flagKey, setFlagKey] = useState(catalog[0]?.key ?? "admin_console");
    const [scopeType, setScopeType] = useState<"global" | "studio" | "user">("global");
    const [studioId, setStudioId] = useState("");
    const [userId, setUserId] = useState("");
    const [enabled, setEnabled] = useState(true);
    const [configText, setConfigText] = useState("{}");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Feature flags</p>
                <h3 className="mt-2 text-lg font-medium text-white">Create or update assignments</h3>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const config = JSON.parse(configText) as Record<string, unknown>;
                            const response = await fetch("/api/admin/flags", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    flagKey,
                                    scopeType,
                                    enabled,
                                    studioId: scopeType === "studio" ? studioId || null : null,
                                    userId: scopeType === "user" ? userId || null : null,
                                    config,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to update feature flag.");
                            }

                            setMessage("Feature flag updated.");
                            router.refresh();
                        } catch (flagError) {
                            setError(flagError instanceof Error ? flagError.message : "Unable to update feature flag.");
                        }
                    });
                }}
            >
                <select
                    value={flagKey}
                    onChange={(event) => setFlagKey(event.target.value)}
                    disabled={isPending}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                >
                    {catalog.map((item) => (
                        <option key={item.key} value={item.key} className="bg-black text-white">
                            {item.key}
                        </option>
                    ))}
                </select>
                <select
                    value={scopeType}
                    onChange={(event) => setScopeType(event.target.value as typeof scopeType)}
                    disabled={isPending}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                >
                    {["global", "studio", "user"].map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                            {option}
                        </option>
                    ))}
                </select>
                {scopeType === "studio" ? (
                    <input
                        value={studioId}
                        onChange={(event) => setStudioId(event.target.value)}
                        disabled={isPending}
                        placeholder="Studio UUID"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                ) : null}
                {scopeType === "user" ? (
                    <input
                        value={userId}
                        onChange={(event) => setUserId(event.target.value)}
                        disabled={isPending}
                        placeholder="User UUID"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                ) : null}
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                        disabled={isPending}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    Enabled
                </label>
                <textarea
                    value={configText}
                    onChange={(event) => setConfigText(event.target.value)}
                    disabled={isPending}
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                />
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : "Save feature flag"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
