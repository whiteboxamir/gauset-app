import { redirect } from "next/navigation";

import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
import MVPRouteClient from "./MVPRouteClient";
import {
    normalizeLaunchEntryMode,
    normalizeLaunchIntent,
    normalizeLaunchProjectId,
    normalizeLaunchSceneId,
    normalizeLaunchSourceKind,
    normalizeLaunchText,
} from "./launchParams";

export const dynamic = "force-dynamic";

export default async function MVPPage({
    searchParams,
}: {
    searchParams: Promise<{ scene?: string; project?: string; intent?: string; brief?: string; refs?: string; provider?: string; source_kind?: string; entry?: string }>;
}) {
    const params = await searchParams;
    const launchSceneId = normalizeLaunchSceneId(params.scene);
    const launchProjectId = normalizeLaunchProjectId(params.project);
    const launchEntryMode = normalizeLaunchEntryMode(params.entry);
    const launchIntent = normalizeLaunchIntent(params.intent);
    const launchBrief = normalizeLaunchText(params.brief, 800);
    const launchReferences = normalizeLaunchText(params.refs, 1000);
    const launchProviderId = normalizeLaunchText(params.provider, 120);
    const launchSourceKind = normalizeLaunchSourceKind(params.source_kind);
    const nextSearchParams = new URLSearchParams();
    if (launchSceneId) {
        nextSearchParams.set("scene", launchSceneId);
    }
    if (launchProjectId) {
        nextSearchParams.set("project", launchProjectId);
    }
    if (launchIntent) {
        nextSearchParams.set("intent", launchIntent);
    }
    if (launchBrief) {
        nextSearchParams.set("brief", launchBrief);
    }
    if (launchReferences) {
        nextSearchParams.set("refs", launchReferences);
    }
    if (launchProviderId) {
        nextSearchParams.set("provider", launchProviderId);
    }
    if (launchSourceKind) {
        nextSearchParams.set("source_kind", launchSourceKind);
    }
    if (launchEntryMode) {
        nextSearchParams.set("entry", launchEntryMode);
    }
    const nextPath =
        launchSceneId
            ? `/mvp?${nextSearchParams.toString()}`
            : nextSearchParams.size > 0
              ? `/mvp/preview?${nextSearchParams.toString()}`
              : "/mvp/preview";

    await requireMvpWorkspaceAccess(nextPath);

    if (!launchSceneId) {
        redirect(nextPath);
    }

    return (
        <MVPRouteClient
            clarityMode={process.env.NEXT_PUBLIC_MVP_CLARITY_DEFAULT === "1"}
            routeVariant="workspace"
            launchSceneId={launchSceneId}
            launchProjectId={launchProjectId}
            launchIntent={launchIntent}
            launchBrief={launchBrief}
            launchReferences={launchReferences}
            launchProviderId={launchProviderId}
            launchEntryMode={launchEntryMode}
            launchSourceKind={launchSourceKind}
            launchWorkspaceHref={null}
            launchPreviewHref={null}
            deploymentFingerprint={getMvpDeploymentFingerprint()}
        />
    );
}
