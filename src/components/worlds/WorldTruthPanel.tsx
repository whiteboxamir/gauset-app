import type { ProjectWorldLink } from "@/server/projects/types";

import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";
import { WorldLinkLifecycleSummary } from "@/components/worlds/WorldLinkLifecycleSummary";

export function WorldTruthPanel({
    projectId,
    projectName,
    worldLink,
}: {
    projectId: string;
    projectName: string;
    worldLink: ProjectWorldLink;
}) {
    return (
        <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">World truth</p>
                    <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">
                        {projectName} keeps source, lane, and delivery posture attached to the project-owned link.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        The platform layer owns <code className="text-white">project_id</code>. The linked <code className="text-white">scene_id</code> stays MVP-owned and
                        must already belong to this project before a reopen is recorded.
                    </p>
                </div>
                <OpenWorkspaceButton
                    projectId={projectId}
                    sceneId={worldLink.sceneId}
                    label={worldLink.isPrimary ? "Reopen primary world" : "Reopen linked world"}
                    variant="secondary"
                />
            </div>

            <div className="mt-5">
                <WorldLinkLifecycleSummary worldLink={worldLink} />
            </div>
        </section>
    );
}
