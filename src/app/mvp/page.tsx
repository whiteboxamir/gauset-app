import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
import MVPRouteClient from "./MVPRouteClient";

export const dynamic = "force-dynamic";

function normalizeLaunchSceneId(value?: string) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return /^[a-z0-9_-]{1,160}$/i.test(normalized) ? normalized : null;
}

function normalizeLaunchProjectId(value?: string) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function normalizeLaunchIntent(value?: string) {
    const normalized = value?.trim();
    if (normalized === "generate" || normalized === "capture" || normalized === "import") {
        return normalized;
    }

    return null;
}

function normalizeLaunchText(value?: string, max = 500) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return normalized.slice(0, max);
}

export default async function MVPPage({
    searchParams,
}: {
    searchParams: Promise<{ scene?: string; project?: string; intent?: string; brief?: string; refs?: string; provider?: string }>;
}) {
    const params = await searchParams;
    const launchSceneId = normalizeLaunchSceneId(params.scene);
    const launchProjectId = normalizeLaunchProjectId(params.project);
    const launchIntent = normalizeLaunchIntent(params.intent);
    const launchBrief = normalizeLaunchText(params.brief, 800);
    const launchReferences = normalizeLaunchText(params.refs, 1000);
    const launchProviderId = normalizeLaunchText(params.provider, 120);
    const nextPath = launchSceneId ? `/mvp?scene=${encodeURIComponent(launchSceneId)}` : "/mvp";

    await requireMvpWorkspaceAccess(nextPath);

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
            deploymentFingerprint={getMvpDeploymentFingerprint()}
        />
    );
}
