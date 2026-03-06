'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  FOUNDERS PRESENCE
  
  Not a team section. Not headshots.
  Three figures standing in the world they built.
  Names appear like end credits — small, factual, earned.
  
  They are at different depths and positions,
  not lined up in a row. They feel discovered, not presented.
*/

const FOUNDER_COUNT = 3;

const founders = [
    { name: 'Amir', position: [-2.5, -4, -38] as [number, number, number], rotation: 0.15 },
    { name: 'Krasi', position: [0.5, -4, -42] as [number, number, number], rotation: -0.08 },
    { name: 'Brett', position: [3.5, -4, -40] as [number, number, number], rotation: 0.05 },
];

export function FoundersPresence({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const figureRefs = useRef<(THREE.Group | null)[]>([]);
    const glowRefs = useRef<(THREE.Mesh | null)[]>([]);

    // Smootherstep — C2-continuous quintic
    const smootherstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-5 * delta);

        // Wider, quintic-eased fade windows for organic feel
        const fadeIn = smootherstep(0.76, 0.85, t);
        const fadeOut = 1 - smootherstep(0.91, 0.97, t);
        const visibility = fadeIn * fadeOut;

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Figures — damped opacity + subtle breathing
        figureRefs.current.forEach((fig, i) => {
            if (!fig) return;
            fig.children.forEach((child) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.opacity += (visibility * 0.55 - mat.opacity) * lerpRate;
            });
            // Each figure breathes slightly out of phase
            const breathPhase = i * 0.7;
            fig.position.y = founders[i].position[1] + Math.sin(time * 0.6 + breathPhase) * 0.02;
        });

        // Ambient glow behind each figure — damped
        glowRefs.current.forEach((glow) => {
            if (!glow) return;
            const mat = glow.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * 0.06 - mat.opacity) * lerpRate;
        });
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Very subdued warm light — presence, not drama */}
            <pointLight position={[0, 2, -40]} intensity={0} color="#D4A04A" distance={25} />
            <ambientLight intensity={0} color="#181410" />

            {/* Overhead warm rim — separates heads from void */}
            <pointLight position={[0, 8, -40]} intensity={0.04} color="#D4A04A" distance={15} />
            {/* Distant warm background anchor */}
            <pointLight position={[0, -5, -55]} intensity={0.02} color="#1A1410" distance={35} />

            {/* Ground fog plane — grounds the figures in space */}
            <mesh position={[0, -4.2, -40]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[30, 20]} />
                <meshBasicMaterial
                    color="#181410"
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Far warm glow — deep background presence */}
            <mesh position={[0, 0, -60]}>
                <sphereGeometry args={[20, 12, 12]} />
                <meshBasicMaterial color="#1A1410" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {founders.map((founder, i) => (
                <group key={founder.name}>
                    {/* Figure silhouette */}
                    <group
                        ref={(el) => { figureRefs.current[i] = el; }}
                        position={founder.position}
                        rotation={[0, founder.rotation, 0]}
                    >
                        {/* Body */}
                        <mesh position={[0, 1.7, 0]}>
                            <capsuleGeometry args={[0.28, 1.1, 4, 8]} />
                            <meshStandardMaterial
                                color="#0C0C0C"
                                emissive="#D4A04A"
                                emissiveIntensity={0.02}
                                transparent
                                opacity={0}
                                roughness={0.95}
                            />
                        </mesh>
                        {/* Head */}
                        <mesh position={[0, 2.7, 0]}>
                            <sphereGeometry args={[0.22, 10, 10]} />
                            <meshStandardMaterial
                                color="#0C0C0C"
                                emissive="#D4A04A"
                                emissiveIntensity={0.02}
                                transparent
                                opacity={0}
                                roughness={0.95}
                            />
                        </mesh>
                        {/* Arms — relaxed, at sides */}
                        <mesh position={[-0.32, 1.3, 0]} rotation={[0, 0, 0.1]}>
                            <capsuleGeometry args={[0.08, 0.75, 3, 6]} />
                            <meshStandardMaterial color="#0C0C0C" transparent opacity={0} />
                        </mesh>
                        <mesh position={[0.32, 1.3, 0]} rotation={[0, 0, -0.1]}>
                            <capsuleGeometry args={[0.08, 0.75, 3, 6]} />
                            <meshStandardMaterial color="#0C0C0C" transparent opacity={0} />
                        </mesh>
                        {/* Legs */}
                        <mesh position={[-0.12, 0.45, 0]}>
                            <capsuleGeometry args={[0.1, 0.7, 3, 6]} />
                            <meshStandardMaterial color="#0C0C0C" transparent opacity={0} />
                        </mesh>
                        <mesh position={[0.12, 0.45, 0]}>
                            <capsuleGeometry args={[0.1, 0.7, 3, 6]} />
                            <meshStandardMaterial color="#0C0C0C" transparent opacity={0} />
                        </mesh>
                    </group>

                    {/* Ambient glow — warm, subtle halo behind each figure */}
                    <mesh
                        ref={(el) => { glowRefs.current[i] = el; }}
                        position={[founder.position[0], founder.position[1] + 1.5, founder.position[2] - 0.5]}
                    >
                        <sphereGeometry args={[1.8, 12, 12]} />
                        <meshBasicMaterial
                            color="#D4A04A"
                            transparent
                            opacity={0}
                            depthWrite={false}
                            side={THREE.BackSide}
                        />
                    </mesh>
                </group>
            ))}

            {/* Ambient depth particles — sparse, warm, floating */}
            <instancedMesh args={[undefined, undefined, 40]} frustumCulled={false}>
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0.01} depthWrite={false} />
            </instancedMesh>
        </group>
    );
}
