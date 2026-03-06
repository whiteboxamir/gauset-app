'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  CLOSING WORLD — The Final Breath
  
  Everything decelerates.
  Particles thin to almost nothing.
  A single warm light holds.
  The void returns — but this time it's intentional.
  
  Calm after everything that came before.
  Space to land.
*/

const CLOSING_PARTICLE_COUNT = 80;

export function ClosingWorld({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const particleRef = useRef<THREE.InstancedMesh>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Very sparse, slow particles — remnants of the experience
    const particleData = useMemo(() => {
        const d = {
            positions: new Float32Array(CLOSING_PARTICLE_COUNT * 3),
            sizes: new Float32Array(CLOSING_PARTICLE_COUNT),
            speeds: new Float32Array(CLOSING_PARTICLE_COUNT),
            phases: new Float32Array(CLOSING_PARTICLE_COUNT),
        };
        for (let i = 0; i < CLOSING_PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            d.positions[i3] = (Math.random() - 0.5) * 40;
            d.positions[i3 + 1] = (Math.random() - 0.5) * 20 - 2;
            d.positions[i3 + 2] = -35 + (Math.random() - 0.5) * 30;
            d.sizes[i] = 0.03 + Math.random() * 0.08;
            d.speeds[i] = 0.005 + Math.random() * 0.01; // Very slow
            d.phases[i] = Math.random() * Math.PI * 2;
        }
        return d;
    }, []);

    // Smootherstep — C2-continuous quintic
    const smootherstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-4 * delta); // slower damping for the final calm

        // Generous fade-in with quintic easing — the world settles in gently
        const fadeIn = smootherstep(0.83, 0.92, t);
        const visibility = fadeIn;

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Single warm point light — breathing slowly, damped
        if (lightRef.current) {
            const targetIntensity = visibility * 0.3 * (0.9 + Math.sin(time * 0.3) * 0.1);
            lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * lerpRate;
        }

        // Sparse particles — very slow drift, damped opacity
        if (particleRef.current) {
            const pMat = particleRef.current.material as THREE.MeshBasicMaterial;
            pMat.opacity += (visibility * 0.15 - pMat.opacity) * lerpRate;

            for (let i = 0; i < CLOSING_PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                const phase = particleData.phases[i];
                const speed = particleData.speeds[i];
                dummy.position.set(
                    particleData.positions[i3] + Math.sin(time * speed + phase) * 1.5,
                    particleData.positions[i3 + 1] + Math.sin(time * speed * 0.7 + phase) * 0.5,
                    particleData.positions[i3 + 2] + Math.cos(time * speed * 0.5 + phase) * 0.8
                );
                dummy.scale.setScalar(particleData.sizes[i]);
                dummy.updateMatrix();
                particleRef.current.setMatrixAt(i, dummy.matrix);
            }
            particleRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Single warm light — the last presence */}
            <pointLight
                ref={lightRef}
                position={[0, 2, -40]}
                intensity={0}
                color="#D4A04A"
                distance={40}
                decay={2}
            />

            {/* Distant cold backlight — depth separation */}
            <pointLight position={[0, -5, -65]} intensity={0.02} color="#1A1A2E" distance={50} />

            {/* Expanding warm glow — the final presence settles outward */}
            <mesh position={[0, 0, -42]}>
                <sphereGeometry args={[18, 16, 16]} />
                <meshBasicMaterial color="#1A1410" transparent opacity={0.04} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Deep void background — far, very faint */}
            <mesh position={[0, 0, -80]}>
                <sphereGeometry args={[40, 12, 12]} />
                <meshBasicMaterial color="#0A0806" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Sparse closing particles — primary */}
            <instancedMesh ref={particleRef} args={[undefined, undefined, CLOSING_PARTICLE_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0} depthWrite={false} />
            </instancedMesh>

            {/* Star-field — positioned distant particles for vast calm */}
            {Array.from({ length: 50 }).map((_, i) => {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                const r = 35 + Math.random() * 30;
                return (
                    <mesh key={i} position={[
                        Math.sin(phi) * Math.cos(theta) * r,
                        Math.sin(phi) * Math.sin(theta) * r * 0.4 - 5,
                        -40 + Math.cos(phi) * r * 0.5
                    ]}>
                        <sphereGeometry args={[0.03 + Math.random() * 0.05, 3, 3]} />
                        <meshBasicMaterial color="#E8DDD0" transparent opacity={0.015} depthWrite={false} />
                    </mesh>
                );
            })}

            {/* Subtle lens flare point */}
            <mesh position={[3, 1, -38]}>
                <sphereGeometry args={[0.08, 6, 6]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0.3} depthWrite={false} />
            </mesh>
        </group>
    );
}
