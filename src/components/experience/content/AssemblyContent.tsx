'use client';

import { EngineSimulation } from '@/components/ui/EngineSimulation';

export function AssemblyContent() {
    return (
        <div className="py-16 flex flex-col justify-center px-6 md:px-16 relative">
            <div className="max-w-6xl mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 items-start mb-16">
                    <div className="md:col-span-8 relative">
                        <div className="absolute -left-12 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/40 to-transparent hidden md:block" />
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter mb-8 text-white leading-[1.1] text-balance">
                            Object permanence <span className="text-neutral-600">and determinism.</span>
                        </h2>
                        <p className="text-xl md:text-2xl text-neutral-400 leading-relaxed max-w-2xl tracking-tight text-pretty">
                            Gauset extracts the explicit 3D&nbsp;structure. Scenes hold. Characters stay. Cameras move precisely. You can <span className="text-white">direct</span>, not roll the dice.
                        </p>
                    </div>
                </div>

                {/* Engine simulation dashboard */}
                <div className="max-w-[1000px] mx-auto">
                    <EngineSimulation />
                </div>
            </div>
        </div>
    );
}
