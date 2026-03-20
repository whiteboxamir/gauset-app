import { redirect } from "next/navigation";

import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
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
        redirect(`/mvp?${workspaceSearchParams.toString()}`);
    }

    const previewSearchParams = new URLSearchParams();
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
    if (launchEntryMode) {
        previewSearchParams.set("entry", launchEntryMode);
    }
    const nextPath = previewSearchParams.size > 0 ? `/mvp?${previewSearchParams.toString()}` : "/mvp";

    await requireMvpWorkspaceAccess(nextPath);
    redirect(nextPath);
}
