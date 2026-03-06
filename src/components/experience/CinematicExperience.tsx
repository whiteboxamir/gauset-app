'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll, Preload } from '@react-three/drei';
import { WorldRenderer } from './WorldRenderer';
import { FilmGrainEffect } from './effects/FilmGrain';
import { HeroContent } from './content/HeroContent';
import { FractureContent } from './content/FractureContent';
import { AssemblyContent } from './content/AssemblyContent';
import { StudioContent } from './content/StudioContent';
import { HorizonContent } from './content/HorizonContent';

export function CinematicExperience() {
    return (
        <div className="fixed inset-0 w-screen h-screen">
            <Canvas
                camera={{ fov: 50, position: [0, 0, 20], near: 0.1, far: 200 }}
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                    stencil: false,
                    depth: true,
                }}
                dpr={[1, 1.5]}
                style={{ background: '#000000' }}
            >
                <color attach="background" args={['#000000']} />
                <fog attach="fog" args={['#000000', 30, 100]} />

                <Suspense fallback={null}>
                    <ScrollControls pages={5} damping={0.15}>
                        {/* 3D worlds */}
                        <WorldRenderer />

                        {/* HTML content overlays */}
                        <Scroll html style={{ width: '100%' }}>
                            <div className="w-screen">
                                <HeroContent />
                                <FractureContent />
                                <AssemblyContent />
                                <StudioContent />
                                <HorizonContent />
                            </div>
                        </Scroll>
                    </ScrollControls>

                    <FilmGrainEffect />
                    <Preload all />
                </Suspense>
            </Canvas>
        </div>
    );
}
