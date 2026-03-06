'use client';

import Image from 'next/image';

export function StudioContent() {
    return (
        <div className="py-16 flex flex-col justify-center px-6 md:px-16 relative">
            <div className="max-w-6xl mx-auto w-full">
                {/* Pipeline header */}
                <h2 className="text-5xl md:text-7xl font-medium tracking-tighter mb-16 md:mb-24 text-center md:text-left flex flex-wrap gap-4 items-center text-balance">
                    <span className="text-white">Text</span>
                    <span className="text-neutral-600 font-light">→</span>
                    <span className="text-white/80">World Engine</span>
                    <span className="text-neutral-600 font-light">→</span>
                    <span className="bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">Direct</span>
                </h2>

                {/* Feature grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                    {[
                        { title: '4D Gaussian Splatting', desc: 'State-of-the-art volumetric rendering for real-time cinematic fidelity.' },
                        { title: 'Agentic Directors', desc: 'Autonomous AI agents that reason over the DOM of the 3D world.' },
                        { title: 'Explicit 3D Structure', desc: 'Interact with individual geometry, lighting, and cameras seamlessly.' },
                        { title: 'Universal Integration', desc: 'Export perfect, persistent environments as OpenUSD.' },
                    ].map((item, i) => (
                        <div
                            key={i}
                            className="flex flex-col group relative bg-neutral-900/30 backdrop-blur-sm border border-white/[0.05] p-8 md:p-12 rounded-[2rem] hover:bg-neutral-900/50 hover:border-white/[0.1] transition-all duration-500 overflow-hidden min-h-[250px] justify-between h-full"
                        >
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                            {i === 0 && (
                                <div className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none">
                                    <Image src="/images/splatting_render.png" alt="Splatting Render" fill className="object-cover mix-blend-screen" />
                                </div>
                            )}

                            <div className="relative z-10 w-full">
                                <div className="text-sm font-medium tracking-widest text-[#00ff9d] opacity-80 uppercase mb-4">{item.title}</div>
                                <p className="text-xl md:text-3xl tracking-tight text-neutral-200 font-medium leading-snug text-pretty">
                                    {item.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
