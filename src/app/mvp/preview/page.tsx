import { redirect } from "next/navigation";

import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
import MVPRouteClient from "../MVPRouteClient";
import {
    normalizeLaunchEntryMode,
    normalizeLaunchIntent,
    normalizeLaunchProjectId,
    normalizeLaunchSceneId,
    normalizeLaunchSourceKind,
    normalizeLaunchText,
} from "../launchParams";

export const dynamic = "force-dynamic";

export default async function MVPPreviewPage({
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
    const directProjectWorkspaceEntry = Boolean(launchProjectId) && !launchSceneId;
    const resolvedLaunchEntryMode = launchEntryMode ?? (directProjectWorkspaceEntry ? "workspace" : null);
    const previewSearchParams = new URLSearchParams();
    if (launchSceneId) {
        previewSearchParams.set("scene", launchSceneId);
    }
    if (launchProjectId) {
        previewSearchParams.set("project", launchProjectId);
    }
    if (launchIntent) {
        previewSearchParams.set("intent", launchIntent);
    }
    if (launchBrief) {
        previewSearchParams.set("brief", launchBrief);
    }
    if (launchReferences) {
        previewSearchParams.set("refs", launchReferences);
    }
    if (launchProviderId) {
        previewSearchParams.set("provider", launchProviderId);
    }
    if (launchSourceKind) {
        previewSearchParams.set("source_kind", launchSourceKind);
    }
    if (resolvedLaunchEntryMode) {
        previewSearchParams.set("entry", resolvedLaunchEntryMode);
    }
    const canonicalProjectPreviewPath = `/mvp/preview?${previewSearchParams.toString()}`;
    if (launchSceneId) {
        redirect(`/mvp?${previewSearchParams.toString()}`);
    }
    const launchPreviewParams = new URLSearchParams(previewSearchParams);
    const launchPreviewHref =
        launchProjectId && !launchSceneId
            ? `/app/worlds/${launchProjectId}#project-world-launch`
            : (() => {
                  launchPreviewParams.delete("entry");
                  return launchPreviewParams.size > 0 ? `/mvp/preview?${launchPreviewParams.toString()}` : "/mvp/preview";
              })();
    const nextPath = directProjectWorkspaceEntry && launchEntryMode !== "workspace" ? canonicalProjectPreviewPath : launchPreviewHref;
    const workspaceSearchParams = new URLSearchParams(launchPreviewParams);
    workspaceSearchParams.set("entry", "workspace");
    const launchWorkspaceHref = `/mvp/preview?${workspaceSearchParams.toString()}`;

    await requireMvpWorkspaceAccess(nextPath);

    if (directProjectWorkspaceEntry && launchEntryMode !== "workspace") {
        redirect(canonicalProjectPreviewPath);
    }

    return (
        <MVPRouteClient
            clarityMode
            routeVariant="preview"
            launchSceneId={launchSceneId}
            launchProjectId={launchProjectId}
            launchIntent={launchIntent}
            launchBrief={launchBrief}
            launchReferences={launchReferences}
            launchProviderId={launchProviderId}
            launchEntryMode={resolvedLaunchEntryMode}
            launchSourceKind={launchSourceKind}
            launchWorkspaceHref={launchWorkspaceHref}
            launchPreviewHref={launchPreviewHref}
            deploymentFingerprint={getMvpDeploymentFingerprint()}
        />
    );
}
