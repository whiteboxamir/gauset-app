import { AdminAccountFlagForm } from "@/components/admin/AdminAccountFlagForm";
import { AdminFeatureFlagForm } from "@/components/admin/AdminFeatureFlagForm";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";
import { requireAdminSession } from "@/server/admin/access";
import { listAdminFlagAssignments, listKnownAdminFeatureFlags } from "@/server/admin/service";

export default async function AdminFlagsPage() {
    await requireAdminSession("/admin/flags");
    const [assignments, catalog] = await Promise.all([listAdminFlagAssignments(), Promise.resolve(listKnownAdminFeatureFlags())]);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
                <AdminFeatureFlagForm catalog={catalog} />
                <AdminAccountFlagForm />
            </div>

            <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Feature catalog</p>
                    <div className="mt-5 grid gap-3 xl:grid-cols-2">
                        {catalog.map((flag) => (
                            <article key={flag.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge label={flag.stage} tone="neutral" />
                                    <StatusBadge label={flag.owner} tone="info" />
                                </div>
                                <p className="mt-3 text-sm font-medium text-white">{flag.title}</p>
                                <p className="mt-2 text-sm leading-7 text-neutral-400">{flag.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Feature assignments</p>
                    <div className="mt-5 space-y-3">
                        {assignments.featureFlags.length === 0 ? (
                            <EmptyState eyebrow="Feature flags" title="No feature assignments" body="New flag assignments will appear here after they are written from the admin form." />
                        ) : (
                            assignments.featureFlags.map((flag) => (
                                <article key={flag.assignmentId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={flag.flagKey} tone="info" />
                                        <StatusBadge label={flag.scopeType} tone="neutral" />
                                        <StatusBadge label={flag.enabled ? "enabled" : "disabled"} tone={flag.enabled ? "success" : "warning"} />
                                    </div>
                                    <p className="mt-3 text-sm text-neutral-300">
                                        {flag.studioName ?? flag.userEmail ?? "Global scope"}
                                    </p>
                                    <p className="mt-2 text-xs text-neutral-500">{formatDateTime(flag.createdAt)}</p>
                                </article>
                            ))
                        )}
                    </div>
                </section>

                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Account overrides</p>
                    <div className="mt-5 space-y-3">
                        {assignments.accountFlags.length === 0 ? (
                            <EmptyState eyebrow="Account flags" title="No account flags" body="Direct studio and user overrides will appear here once they are issued." />
                        ) : (
                            assignments.accountFlags.map((flag) => (
                                <article key={flag.assignmentId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={flag.flagKey} tone="warning" />
                                        {flag.expiresAt ? <StatusBadge label="expires" tone="neutral" /> : null}
                                    </div>
                                    <p className="mt-3 text-sm text-neutral-300">{flag.studioName ?? flag.userEmail ?? "Unknown target"}</p>
                                    <p className="mt-2 text-sm text-neutral-500">{flag.reason ?? "No reason supplied."}</p>
                                    <p className="mt-2 text-xs text-neutral-500">{formatDateTime(flag.createdAt)}</p>
                                </article>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
