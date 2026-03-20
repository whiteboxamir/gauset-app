import type { SupportMessage } from "@/server/contracts/support";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

export function SupportThreadMessages({
    messages,
}: {
    messages: SupportMessage[];
}) {
    if (messages.length === 0) {
        return <EmptyState eyebrow="Messages" title="No support messages yet" body="The thread exists, but no participant messages have been recorded yet." />;
    }

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Conversation</p>
            <div className="mt-5 space-y-3">
                {messages.map((message) => (
                    <article
                        key={message.messageId}
                        className={`rounded-2xl border px-4 py-4 ${
                            message.authorType === "admin"
                                ? "border-cyan-400/20 bg-cyan-500/10"
                                : message.authorType === "system"
                                  ? "border-white/10 bg-black/20"
                                  : "border-white/10 bg-white/[0.03]"
                        }`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge label={message.authorType} tone={message.authorType === "admin" ? "warning" : "neutral"} />
                                <p className="text-sm text-white">
                                    {message.authorType === "admin" ? "Gauset ops" : message.authorType === "system" ? "System note" : "Workspace reply"}
                                </p>
                                <p className="text-xs text-neutral-500">{formatDateTime(message.createdAt)}</p>
                            </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">{message.body}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}
