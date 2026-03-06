'use client';

import { WaitlistForm } from '@/components/ui/WaitlistForm';

export function HeroContent() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative py-16">
            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 md:px-10 py-5">
                <div className="text-white font-bold tracking-wider text-sm">GAUSET</div>
                <a
                    href="/login"
                    className="text-white/70 text-sm border border-white/10 rounded-full px-5 py-2 hover:bg-white/5 transition-colors"
                >
                    Log In
                </a>
            </nav>

            {/* Hero text */}
            <h1 className="text-6xl sm:text-7xl md:text-9xl font-medium tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 pb-2 leading-[0.95]">
                Build worlds.<br />
                Not clips.
            </h1>
            <p className="max-w-xl md:max-w-2xl text-xl md:text-3xl tracking-tight text-neutral-300 mb-2 leading-snug text-pretty">
                From &quot;Prompt&nbsp;Roulette&quot; to Directed&nbsp;Neural&nbsp;Cinema.
            </p>
            <p className="max-w-xl md:max-w-2xl text-lg md:text-xl tracking-tight text-neutral-500 mb-12 leading-relaxed text-pretty">
                Gauset natively bridges the gap between implicit AI&nbsp;world&nbsp;models and deterministic production&nbsp;control.
            </p>
            <div className="w-full max-w-sm">
                <WaitlistForm size="large" />
            </div>
        </div>
    );
}
