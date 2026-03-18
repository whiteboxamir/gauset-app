import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { requireMvpWorkspaceAccess } from "@/server/mvp/access";
import MVPRouteClient from "../MVPRouteClient";

export const dynamic = "force-dynamic";

export default async function MVPPreviewPage() {
    await requireMvpWorkspaceAccess("/mvp/preview");

    return <MVPRouteClient clarityMode routeVariant="preview" deploymentFingerprint={getMvpDeploymentFingerprint()} />;
}
