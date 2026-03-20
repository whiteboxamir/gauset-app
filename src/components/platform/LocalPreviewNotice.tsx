import Link from "next/link";

export function LocalPreviewNotice({
    title = "Local preview",
    body = "Persistent world flow is live here. Review, handoff, and studio mutations stay off.",
    canAccessMvp = true,
    showWorldStartAction = true,
}: {
    title?: string;
    body?: string;
    canAccessMvp?: boolean;
    showWorldStartAction?: boolean;
}) {
    return (
        <section className="rounded-[1.35rem] border border-[#dcc3a1]/22 bg-[linear-gradient(180deg,rgba(220,195,161,0.1),rgba(19,15,13,0.62))] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#dcc3a1]/28 bg-[#dcc3a1]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f3debf]">
                            Local preview
                        </span>
                        <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ddd5cb]">
                            World flow live
                        </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="text-sm font-medium text-[var(--foreground)]">{title}</h2>
                        <p className="text-sm leading-6 text-[#c8c0b5]">{body}</p>
                    </div>
                    <p className="mt-2 text-xs text-[#9d978f]">Preview tells the truth about what is live: world routing is on, but review links, live handoff, and project mutations stay off.</p>
                </div>
                <div className="flex flex-wrap gap-3 sm:justify-end">
                    {showWorldStartAction && canAccessMvp ? (
                        <Link
                            href="/mvp"
                            className="rounded-2xl bg-[#f4efe8] px-4 py-2.5 text-sm font-semibold text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                        >
                            Open world start
                        </Link>
                    ) : showWorldStartAction ? (
                        <span className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[#d3ccc2]">
                            World start unavailable
                        </span>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
