'use client';

import Link from 'next/link';

import { WaitlistForm } from '@/components/ui/WaitlistForm';

export function HeroContent() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative py-16">
            <header className="marketing-header">
                <div className="marketing-header__inner">
                    <div className="marketing-header__row">
                        <div className="marketing-header__group">
                            <div className="pointer-events-auto text-sm font-bold tracking-wider text-white">GAUSET</div>
                        </div>
                        <div className="marketing-header__actions">
                            <Link
                                href="/auth/login"
                                className="pointer-events-auto inline-flex min-h-10 items-center rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 sm:px-5"
                            >
                                Log in
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

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
