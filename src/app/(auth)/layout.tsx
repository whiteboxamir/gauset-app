import type { ReactNode } from "react";

import { BackgroundNoise } from "@/components/ui/BackgroundNoise";

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20">
            <BackgroundNoise />
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute left-[-10%] top-[-20%] h-[38rem] w-[38rem] rounded-full bg-[rgba(39,84,106,0.22)] blur-[140px]" />
                <div className="absolute bottom-[-18%] right-[-10%] h-[34rem] w-[34rem] rounded-full bg-[rgba(113,71,32,0.18)] blur-[140px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.18]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.18)_56%,rgba(0,0,0,0.6)_100%)]" />
            </div>
            <div className="flex min-h-screen items-start justify-center overflow-y-auto px-6 py-8 lg:items-center lg:p-10">{children}</div>
        </div>
    );
}
