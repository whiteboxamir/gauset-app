'use client';

export function FractureContent() {
    return (
        <div className="py-16 flex items-center px-6 md:px-16 relative">
            <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-4 hidden md:block" />
                <div className="md:col-span-8 relative">
                    <div className="absolute -left-12 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent hidden md:block" />
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter mb-8 leading-[1.1] text-balance text-white">
                        AI video breaks at production.
                    </h2>
                    <p className="text-xl md:text-2xl text-neutral-400 leading-relaxed max-w-2xl tracking-tight text-pretty">
                        You can generate clips. But you can&apos;t build scenes. Nothing persists. Everything resets.
                    </p>
                </div>
            </div>
        </div>
    );
}
