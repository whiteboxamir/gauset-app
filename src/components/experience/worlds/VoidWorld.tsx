'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WorldProps {
    visibility: Float32Array;
    progress: Float32Array;
    index: number;
}

const NEBULA_COUNT = 1200;
const FOG_LAYER_COUNT = 8;
const STAR_COUNT = 300;

// Deep atmospheric space — volumetric fog, blue/purple, slow elegant motion
export function VoidWorld({ visibility, progress, index }: WorldProps) {
    const groupRef = useRef<THREE.Group>(null);
    const nebulaRef = useRef<THREE.InstancedMesh>(null);
    const starsRef = useRef<THREE.InstancedMesh>(null);
    const fogLayersRef = useRef<THREE.Group>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Nebula particle data
    const nebula = useMemo(() => {
        const positions = new Float32Array(NEBULA_COUNT * 3);
        const velocities = new Float32Array(NEBULA_COUNT * 3);
        const sizes = new Float32Array(NEBULA_COUNT);
        const colors = new Float32Array(NEBULA_COUNT * 3);
        const phases = new Float32Array(NEBULA_COUNT);

        const colorPalette = [
            new THREE.Color('#1a0a3e'), // deep purple
            new THREE.Color('#0a1a4e'), // deep blue
            new THREE.Color('#2a1a5e'), // violet
            new THREE.Color('#0a2a5e'), // ocean blue
            new THREE.Color('#3a1a6e'), // bright purple
        ];

        for (let i = 0; i < NEBULA_COUNT; i++) {
            const i3 = i * 3;
            // Distribute in a wide volume with concentration toward center
            const r = Math.pow(Math.random(), 0.6) * 50;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;

            positions[i3] = Math.cos(theta) * Math.cos(phi) * r;
            positions[i3 + 1] = Math.sin(phi) * r * 0.6;
            positions[i3 + 2] = Math.sin(theta) * Math.cos(phi) * r - 10;

            velocities[i3] = (Math.random() - 0.5) * 0.003;
            velocities[i3 + 1] = (Math.random() - 0.5) * 0.002;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.001;

            sizes[i] = 0.02 + Math.random() * 0.08;
            phases[i] = Math.random() * Math.PI * 2;

            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }
        return { positions, velocities, sizes, colors, phases };
    }, []);

    // Starfield data
    const stars = useMemo(() => {
        const positions = new Float32Array(STAR_COUNT * 3);
        const sizes = new Float32Array(STAR_COUNT);
        const twinklePhases = new Float32Array(STAR_COUNT);

        for (let i = 0; i < STAR_COUNT; i++) {
            const i3 = i * 3;
            const r = 40 + Math.random() * 60;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;

            positions[i3] = Math.cos(theta) * Math.cos(phi) * r;
            positions[i3 + 1] = Math.sin(phi) * r * 0.5 + 5;
            positions[i3 + 2] = Math.sin(theta) * Math.cos(phi) * r - 20;

            sizes[i] = 0.015 + Math.random() * 0.04;
            twinklePhases[i] = Math.random() * Math.PI * 2;
        }
        return { positions, sizes, twinklePhases };
    }, []);

    useFrame((state) => {
        const vis = visibility[index];
        if (!groupRef.current) return;

        if (vis <= 0) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        const time = state.clock.elapsedTime;

        // Animate nebula particles — very slow, ethereal drift
        if (nebulaRef.current) {
            for (let i = 0; i < NEBULA_COUNT; i++) {
                const i3 = i * 3;
                const phase = nebula.phases[i];

                // Slow brownian drift
                nebula.positions[i3] += nebula.velocities[i3];
                nebula.positions[i3 + 1] += nebula.velocities[i3 + 1];
                nebula.positions[i3 + 2] += nebula.velocities[i3 + 2];

                // Gentle oscillation
                const ox = Math.sin(time * 0.05 + phase) * 0.02;
                const oy = Math.cos(time * 0.04 + phase * 1.3) * 0.015;

                dummy.position.set(
                    nebula.positions[i3] + ox,
                    nebula.positions[i3 + 1] + oy,
                    nebula.positions[i3 + 2]
                );
                // Pulse size slightly
                const pulse = 1 + Math.sin(time * 0.2 + phase) * 0.15;
                dummy.scale.setScalar(nebula.sizes[i] * pulse);
                dummy.updateMatrix();
                nebulaRef.current.setMatrixAt(i, dummy.matrix);
            }
            nebulaRef.current.instanceMatrix.needsUpdate = true;

            const mat = nebulaRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = vis * 0.5;
        }

        // Animate stars — subtle twinkle
        if (starsRef.current) {
            for (let i = 0; i < STAR_COUNT; i++) {
                const i3 = i * 3;
                dummy.position.set(
                    stars.positions[i3],
                    stars.positions[i3 + 1],
                    stars.positions[i3 + 2]
                );
                const twinkle = 0.7 + Math.sin(time * 0.8 + stars.twinklePhases[i]) * 0.3;
                dummy.scale.setScalar(stars.sizes[i] * twinkle);
                dummy.updateMatrix();
                starsRef.current.setMatrixAt(i, dummy.matrix);
            }
            starsRef.current.instanceMatrix.needsUpdate = true;

            const starMat = starsRef.current.material as THREE.MeshBasicMaterial;
            starMat.opacity = vis * 0.6;
        }

        // Animate fog layers — slow drift
        if (fogLayersRef.current) {
            fogLayersRef.current.children.forEach((child, i) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshBasicMaterial;
                const drift = Math.sin(time * 0.03 + i * 1.5) * 2;
                mesh.position.x = drift;
                mat.opacity = vis * (0.04 + Math.sin(time * 0.1 + i * 0.8) * 0.02);
            });
        }
    });

    return (
        <group ref={groupRef}>
            {/* Deep blue key light — from upper right, faint */}
            <directionalLight
                position={[15, 20, 10]}
                intensity={0.15}
                color="#4A6FA5"
            />

            {/* Purple rim light — opposite side */}
            <directionalLight
                position={[-20, -5, -15]}
                intensity={0.08}
                color="#6B4C9A"
            />

            {/* Near-zero ambient — true void */}
            <ambientLight intensity={0.01} color="#0a0a2e" />

            {/* Distant nebula glow — large faint light */}
            <pointLight
                position={[0, 5, -40]}
                intensity={0.3}
                color="#2a1a5e"
                distance={80}
                decay={2}
            />

            {/* Nebula particles — deep space dust */}
            <instancedMesh
                ref={nebulaRef}
                args={[undefined, undefined, NEBULA_COUNT]}
                frustumCulled={false}
            >
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial
                    color="#4A6FA5"
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                />
            </instancedMesh>

            {/* Starfield — distant pinpoints */}
            <instancedMesh
                ref={starsRef}
                args={[undefined, undefined, STAR_COUNT]}
                frustumCulled={false}
            >
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial
                    color="#E8DDE8"
                    transparent
                    opacity={0.6}
                    depthWrite={false}
                />
            </instancedMesh>

            {/* Volumetric fog layers — stacked translucent planes */}
            <group ref={fogLayersRef}>
                {Array.from({ length: FOG_LAYER_COUNT }).map((_, i) => (
                    <mesh
                        key={i}
                        position={[
                            (Math.random() - 0.5) * 10,
                            (Math.random() - 0.5) * 8,
                            -5 - i * 5
                        ]}
                        rotation={[
                            (Math.random() - 0.5) * 0.3,
                            (Math.random() - 0.5) * 0.5,
                            0
                        ]}
                    >
                        <planeGeometry args={[40 + i * 5, 25 + i * 3]} />
                        <meshBasicMaterial
                            color={i % 2 === 0 ? '#0a0a2e' : '#1a0a3e'}
                            transparent
                            opacity={0.04}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>

            {/* Deep void sphere backdrop */}
            <mesh position={[0, 0, -50]}>
                <sphereGeometry args={[60, 16, 16]} />
                <meshBasicMaterial
                    color="#050510"
                    transparent
                    opacity={0.8}
                    side={THREE.BackSide}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}
