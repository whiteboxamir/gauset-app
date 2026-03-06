'use client';

import Link from 'next/link';
import { WaitlistForm } from '@/components/ui/WaitlistForm';

export function HorizonContent() {
    return (
        <div className="py-16 flex flex-col justify-between px-6 md:px-16 relative">
            {/* Founders section */}
            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col justify-center">
                <h2 className="text-4xl md:text-5xl font-medium tracking-tighter mb-12 text-center text-white text-balance">
                    The Team Behind the Engine.
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-16">
                    {[
                        { name: 'Amir Bozorgzadeh', role: 'CEO - PROCESS', img: 'https://github.com/amirboz.png' },
                        { name: 'Krasimir Nikolov', role: 'CTO - TECH', img: 'https://github.com/krasimir.png' },
                        { name: 'Brett Leonard', role: 'CCO - IP', img: 'https://github.com/brett.png' },
                    ].map((founder, i) => (
                        <div key={i} className="flex flex-col items-center">
                            <div className="relative w-40 aspect-square rounded-[3rem] overflow-hidden mb-6 border border-white/[0.08] group shadow-[0_0_40px_rgba(0,255,157,0.05)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={founder.img}
                                    alt={founder.name}
                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-[1.1] grayscale hover:grayscale-0"
                                />
                                <div className="absolute inset-0 bg-neutral-900/40 mix-blend-multiply group-hover:opacity-0 transition-opacity" />
                            </div>
                            <h3 className="text-xl md:text-2xl font-medium tracking-tight text-white mb-2">{founder.name}</h3>
                            <div className="py-1 px-3 rounded-full border border-[#00ff9d]/30 bg-[#00ff9d]/5 text-[#00ff9d] font-mono tracking-widest text-[10px] uppercase">
                                {founder.role}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Final CTA */}
                <div className="text-center">
                    <h2 className="text-[clamp(2rem,6vw,5rem)] font-medium tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/30 leading-[1.05] text-balance mx-auto max-w-4xl">
                        The production layer for AI&#8209;generated&nbsp;worlds.
                    </h2>
                    <div className="w-full max-w-sm mx-auto">
                        <WaitlistForm size="large" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center pt-8 border-t border-white/[0.05] text-sm text-neutral-500 font-medium">
                <div>© {new Date().getFullYear()} Gauset Inc.</div>
                <div className="flex gap-8 mt-4 sm:mt-0">
                    <Link href="#" className="hover:text-white transition-colors duration-300">Privacy</Link>
                    <Link href="#" className="hover:text-white transition-colors duration-300">Terms</Link>
                    <Link href="#" className="hover:text-white transition-colors duration-300">Twitter</Link>
                </div>
            </footer>
        </div>
    );
}
