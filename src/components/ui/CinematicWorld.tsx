'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
// @ts-ignore — maath has no type declarations
import * as random from 'maath/random/dist/maath-random.esm';
import * as THREE from 'three';

function GaussianSplatCloud(props: any) {
    const ref = useRef<any>(null);

    // Create an explicit geometry shape that looks like a futuristic world/torus, 
    // not just a random sphere.
    const particleCount = 20000;

    const positions = useMemo(() => {
        const pts = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            // Create a massive dual torus knot layout for the 'World Engine'
            const u = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI * 2;

            const q = 3;
            const p = 5;

            // Torus knot equations
            const r = Math.cos(q * u) + 2;
            const main_x = r * Math.cos(p * u) * 2;
            const main_y = r * Math.sin(p * u) * 2;
            const main_z = -Math.sin(q * u) * 2;

            // Add spread / gaussian noise
            const noiseX = (Math.random() - 0.5) * 1.5;
            const noiseY = (Math.random() - 0.5) * 1.5;
            const noiseZ = (Math.random() - 0.5) * 1.5;

            pts[i * 3] = main_x + noiseX;
            pts[i * 3 + 1] = main_y + noiseY;
            pts[i * 3 + 2] = main_z + noiseZ;
        }
        return pts;
    }, []);

    useFrame((state, delta) => {
        if (ref.current) {
            ref.current.rotation.x -= delta / 10;
            ref.current.rotation.y -= delta / 15;

            // Living animation pulse
            const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 1;
            ref.current.scale.set(pulse, pulse, pulse);
        }
    });

    return (
        <group rotation={[0, 0, Math.PI / 4]}>
            <Points ref={ref} positions={positions} stride={3} frustumCulled={false} {...props}>
                <PointMaterial
                    transparent
                    color="#00ff9d"
                    size={0.015}
                    sizeAttenuation={true}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </Points>
        </group>
    );
}

export function CinematicWorld() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none w-full h-full bg-black">
            {/* Heavy vignette to blend the scene into the pure black background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] z-10" />

            {/* Living engine animation full page */}
            <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
                <ambientLight intensity={0.5} />
                <GaussianSplatCloud />
            </Canvas>
        </div>
    );
}
