import { getMvpDeploymentFingerprint } from "@/lib/mvp-deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return Response.json({
        status: "ok",
        fingerprint: getMvpDeploymentFingerprint(),
    });
}
