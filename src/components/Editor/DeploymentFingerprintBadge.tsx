import { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";

export default function DeploymentFingerprintBadge({
    fingerprint,
    testId = "mvp-deployment-fingerprint",
}: {
    fingerprint: MvpDeploymentFingerprint;
    testId?: string;
}) {
    return (
        <div
            className="pointer-events-none fixed bottom-4 left-4 z-[80] hidden max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-black/70 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-md lg:block"
            data-testid={testId}
        >
            <p className="text-[9px] uppercase tracking-[0.24em] text-cyan-200/70">Frontend build</p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.02em] text-white">{fingerprint.build_label}</p>
            <p className="mt-1 text-[10px] text-neutral-400">
                {fingerprint.commit_ref || "detached"}{fingerprint.deployment_id ? ` · ${fingerprint.deployment_id}` : ""}
            </p>
        </div>
    );
}
