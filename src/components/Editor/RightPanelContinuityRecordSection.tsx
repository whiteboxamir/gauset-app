"use client";

import type { WorldContinuityRecord } from "@/lib/mvp-workspace";

function continuityStatusLabel(journeyStage: "start" | "unsaved" | "saved", filledCount: number) {
    if (journeyStage === "saved") {
        return filledCount > 0 ? "Attached to saved world" : "Saved world ready for continuity";
    }

    if (journeyStage === "unsaved") {
        return filledCount > 0 ? "Will anchor on first save" : "Add continuity before first save";
    }

    return filledCount > 0 ? "Continuity draft started" : "Waiting for first world";
}

function ContinuityField({
    label,
    value,
    placeholder,
    hint,
    onChange,
    testId,
}: {
    label: string;
    value: string;
    placeholder: string;
    hint: string;
    onChange: (value: string) => void;
    testId: string;
}) {
    return (
        <label className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={4}
                placeholder={placeholder}
                data-testid={testId}
                className="w-full rounded-[1rem] border border-white/8 bg-black/20 px-3 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-sky-400/30 focus:bg-black/25"
            />
            <p className="text-[11px] leading-5 text-neutral-500">{hint}</p>
        </label>
    );
}

export function RightPanelContinuityRecordSection({
    continuity,
    journeyStage,
    onPatchContinuity,
}: {
    continuity: WorldContinuityRecord;
    journeyStage: "start" | "unsaved" | "saved";
    onPatchContinuity: (patch: Partial<WorldContinuityRecord>) => void;
}) {
    const filledCount = [continuity.worldBible, continuity.castContinuity, continuity.lookDevelopment, continuity.shotPlan].filter(
        (value) => value.trim().length > 0,
    ).length;
    const statusLabel = continuityStatusLabel(journeyStage, filledCount);

    return (
        <section className="space-y-4 border-b border-neutral-800/80 p-4" data-testid="mvp-world-record">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">World record</p>
                    <h3 className="mt-2 text-[15px] font-medium tracking-tight text-white">Continuity memory attached to this world</h3>
                    <p className="mt-2 text-[12px] leading-5 text-neutral-400">
                        This record reopens with the saved world so review, handoff, cast continuity, look development, and shot direction stay attached to one durable source of truth.
                    </p>
                </div>
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300">
                    {statusLabel}
                </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <ContinuityField
                    label="World bible"
                    value={continuity.worldBible}
                    placeholder="Core location rules, story constraints, physical details, and anything that must stay true every time this world reopens."
                    hint="Use this for the durable memory of the world itself."
                    onChange={(value) => onPatchContinuity({ worldBible: value })}
                    testId="mvp-world-bible"
                />
                <ContinuityField
                    label="Cast continuity"
                    value={continuity.castContinuity}
                    placeholder="Named cast, wardrobe, blocking constraints, eyelines, props, or continuity warnings that must follow this world."
                    hint="Keep cast and blocking notes attached to the world record, not a disposable prompt."
                    onChange={(value) => onPatchContinuity({ castContinuity: value })}
                    testId="mvp-cast-continuity"
                />
                <ContinuityField
                    label="Look development"
                    value={continuity.lookDevelopment}
                    placeholder="Lens language, grade references, production design, mood, texture, or look references that should persist."
                    hint="Track the visual language that review and handoff should keep honoring."
                    onChange={(value) => onPatchContinuity({ lookDevelopment: value })}
                    testId="mvp-look-development"
                />
                <ContinuityField
                    label="Shot list and sequence direction"
                    value={continuity.shotPlan}
                    placeholder="Sequence beats, shot order, coverage intent, camera moves, or editorial dependencies tied to this saved world."
                    hint="Use this for the thin sequence plan that survives save, reopen, and handoff."
                    onChange={(value) => onPatchContinuity({ shotPlan: value })}
                    testId="mvp-shot-plan"
                />
            </div>
        </section>
    );
}
