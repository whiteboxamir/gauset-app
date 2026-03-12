import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import MVPRouteClient from "../MVPRouteClient";

export default function MVPPreviewPage() {
    return <MVPRouteClient clarityMode routeVariant="preview" deploymentFingerprint={getMvpDeploymentFingerprint()} />;
}
