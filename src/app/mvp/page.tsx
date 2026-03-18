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

export default async function MVPPage({
    searchParams,
}: {
    searchParams: Promise<{ scene?: string }>;
}) {
    const params = await searchParams;
    const launchSceneId = normalizeLaunchSceneId(params.scene);
    const nextPath = launchSceneId ? `/mvp?scene=${encodeURIComponent(launchSceneId)}` : "/mvp";

    await requireMvpWorkspaceAccess(nextPath);

    return (
        <MVPRouteClient
            clarityMode={process.env.NEXT_PUBLIC_MVP_CLARITY_DEFAULT === "1"}
            routeVariant="workspace"
            launchSceneId={launchSceneId}
            deploymentFingerprint={getMvpDeploymentFingerprint()}
        />
    );
}
