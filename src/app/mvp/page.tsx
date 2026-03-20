import { redirect } from "next/navigation";

import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
import { resolveDirectUploadCapability } from "@/server/mvp/upload";
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
    const resolvedLaunchEntryMode = launchSceneId ? null : launchEntryMode;
    const resolvedLaunchIntent = launchSceneId ? null : launchIntent;
    const resolvedLaunchBrief = launchSceneId ? null : launchBrief;
    const resolvedLaunchReferences = launchSceneId ? null : launchReferences;
    const resolvedLaunchProviderId = launchSceneId ? null : launchProviderId;

    if (launchSceneId) {
        const workspaceSearchParams = new URLSearchParams({
            scene: launchSceneId,
        });
        if (launchProjectId) {
            workspaceSearchParams.set("project", launchProjectId);
        }
        if (launchSourceKind) {
            workspaceSearchParams.set("source_kind", launchSourceKind);
        }
        const canonicalWorkspacePath = `/mvp?${workspaceSearchParams.toString()}`;

        await requireMvpWorkspaceAccess(canonicalWorkspacePath);

        if (launchEntryMode || launchIntent || launchBrief || launchReferences || launchProviderId) {
            redirect(canonicalWorkspacePath);
        }
    }

    const nextSearchParams = new URLSearchParams();
    if (launchSceneId) {
        nextSearchParams.set("scene", launchSceneId);
    }
    if (launchProjectId) {
        nextSearchParams.set("project", launchProjectId);
    }
    if (resolvedLaunchIntent) {
        nextSearchParams.set("intent", resolvedLaunchIntent);
    }
    if (resolvedLaunchBrief) {
        nextSearchParams.set("brief", resolvedLaunchBrief);
    }
    if (resolvedLaunchReferences) {
        nextSearchParams.set("refs", resolvedLaunchReferences);
    }
    if (resolvedLaunchProviderId) {
        nextSearchParams.set("provider", resolvedLaunchProviderId);
    }
    if (launchSourceKind) {
        nextSearchParams.set("source_kind", launchSourceKind);
    }
    if (resolvedLaunchEntryMode && !launchSceneId) {
        nextSearchParams.set("entry", resolvedLaunchEntryMode);
    }
    const nextPath = nextSearchParams.size > 0 ? `/mvp?${nextSearchParams.toString()}` : "/mvp";
    const initialUploadCapability = resolveDirectUploadCapability();

    await requireMvpWorkspaceAccess(nextPath);

    if (launchSceneId) {
        const launchPreviewParams = new URLSearchParams(nextSearchParams);
        launchPreviewParams.delete("entry");
        const launchPreviewHref = launchProjectId
            ? `/app/worlds/${launchProjectId}#project-world-launch`
            : launchPreviewParams.size > 0
              ? `/mvp?${launchPreviewParams.toString()}`
              : "/mvp";
        const launchWorkspaceParams = new URLSearchParams(nextSearchParams);
        launchWorkspaceParams.set("entry", "workspace");
        const launchWorkspaceHref = `/mvp?${launchWorkspaceParams.toString()}`;

        return (
            <MVPRouteClient
                clarityMode={process.env.NEXT_PUBLIC_MVP_CLARITY_DEFAULT === "1"}
                routeVariant="workspace"
                launchSceneId={launchSceneId}
                launchProjectId={launchProjectId}
                launchIntent={resolvedLaunchIntent}
                launchBrief={resolvedLaunchBrief}
                launchReferences={resolvedLaunchReferences}
                launchProviderId={resolvedLaunchProviderId}
                launchEntryMode={resolvedLaunchEntryMode}
                launchSourceKind={launchSourceKind}
                launchWorkspaceHref={launchWorkspaceHref}
                launchPreviewHref={launchPreviewHref}
                initialUploadCapability={initialUploadCapability}
                deploymentFingerprint={getMvpDeploymentFingerprint()}
            />
        );
    }

    const launchPreviewParams = new URLSearchParams(nextSearchParams);
    launchPreviewParams.delete("entry");
    const launchPreviewHref = launchProjectId
        ? `/app/worlds/${launchProjectId}#project-world-launch`
        : launchPreviewParams.size > 0
          ? `/mvp?${launchPreviewParams.toString()}`
          : "/mvp";
    const launchWorkspaceParams = new URLSearchParams(nextSearchParams);
    launchWorkspaceParams.set("entry", "workspace");
    const launchWorkspaceHref = `/mvp?${launchWorkspaceParams.toString()}`;

    return (
        <MVPRouteClient
            clarityMode
            routeVariant="launchpad"
            launchSceneId={launchSceneId}
            launchProjectId={launchProjectId}
            launchIntent={resolvedLaunchIntent}
            launchBrief={resolvedLaunchBrief}
            launchReferences={resolvedLaunchReferences}
            launchProviderId={resolvedLaunchProviderId}
            launchEntryMode={resolvedLaunchEntryMode}
            launchSourceKind={launchSourceKind}
            launchWorkspaceHref={launchWorkspaceHref}
            launchPreviewHref={launchPreviewHref}
            initialUploadCapability={initialUploadCapability}
            deploymentFingerprint={getMvpDeploymentFingerprint()}
        />
    );
}
