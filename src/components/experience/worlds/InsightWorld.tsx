'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  INSIGHT WORLD — The Dawn of Structure
  
  Contrasts the cold, chaotic fracture.
  Warm golden particles converge into grid-like patterns.
  Emerging wireframe structures suggest persistence.
  Dawn-like atmosphere — the "aha" moment.
  
  Active during scroll 0.30–0.45
*/

const CONVERGING_COUNT = 600;
const GRID_POINT_COUNT = 200;

export function InsightWorld({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const convergingRef = useRef<THREE.InstancedMesh>(null);
    const gridRef = useRef<THREE.InstancedMesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);
    const light1Ref = useRef<THREE.PointLight>(null);
    const light2Ref = useRef<THREE.PointLight>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const smootherstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    // Scattered positions that converge into a grid
    const particleData = useMemo(() => {
        const d = {
            scatteredPos: new Float32Array(CONVERGING_COUNT * 3),
            gridPos: new Float32Array(CONVERGING_COUNT * 3),
            sizes: new Float32Array(CONVERGING_COUNT),
            phases: new Float32Array(CONVERGING_COUNT),
        };
        for (let i = 0; i < CONVERGING_COUNT; i++) {
            const i3 = i * 3;
            // Scattered chaotic positions
            d.scatteredPos[i3] = (Math.random() - 0.5) * 50;
            d.scatteredPos[i3 + 1] = (Math.random() - 0.5) * 30;
            d.scatteredPos[i3 + 2] = -15 + (Math.random() - 0.5) * 30;

            // Grid target positions — orderly, architectural
            const gridSpacing = 2.5;
            const cols = 20;
            const row = Math.floor(i / cols);
            const col = i % cols;
            d.gridPos[i3] = (col - cols / 2) * gridSpacing + (Math.random() - 0.5) * 0.3;
            d.gridPos[i3 + 1] = (row - (CONVERGING_COUNT / cols) / 2) * gridSpacing * 0.6 + (Math.random() - 0.5) * 0.3;
            d.gridPos[i3 + 2] = -25 + (Math.random() - 0.5) * 8;

            d.sizes[i] = 0.02 + Math.random() * 0.06;
            d.phases[i] = Math.random() * Math.PI * 2;
        }
        return d;
    }, []);

    // Grid structure points — dotted wireframe grid
    const gridData = useMemo(() => {
        const d = {
            positions: new Float32Array(GRID_POINT_COUNT * 3),
            sizes: new Float32Array(GRID_POINT_COUNT),
        };
        const spacing = 3;
        const cols = 14;
        for (let i = 0; i < GRID_POINT_COUNT; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            d.positions[i * 3] = (col - cols / 2) * spacing;
            d.positions[i * 3 + 1] = -4;
            d.positions[i * 3 + 2] = -15 - row * spacing;
            d.sizes[i] = 0.04 + Math.random() * 0.02;
        }
        return d;
    }, []);

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-4 * delta);

        const fadeIn = smootherstep(0.28, 0.35, t);
        const fadeOut = 1 - smootherstep(0.43, 0.50, t);
        const visibility = fadeIn * fadeOut;
        const convergeProgress = smootherstep(0.30, 0.42, t);

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Warm glow sphere
        if (glowRef.current) {
            const mat = glowRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * 0.1 - mat.opacity) * lerpRate;
        }

        // Lights
        if (light1Ref.current) {
            light1Ref.current.intensity += (visibility * 0.6 - light1Ref.current.intensity) * lerpRate;
        }
        if (light2Ref.current) {
            light2Ref.current.intensity += (visibility * 0.3 - light2Ref.current.intensity) * lerpRate;
        }

        // Converging particles — scattered → grid
        if (convergingRef.current) {
            const mat = convergingRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity += (visibility * 0.7 - mat.opacity) * lerpRate;

            for (let i = 0; i < CONVERGING_COUNT; i++) {
                const i3 = i * 3;
                const phase = particleData.phases[i];

                const x = THREE.MathUtils.lerp(particleData.scatteredPos[i3], particleData.gridPos[i3], convergeProgress);
                const y = THREE.MathUtils.lerp(particleData.scatteredPos[i3 + 1], particleData.gridPos[i3 + 1], convergeProgress);
                const z = THREE.MathUtils.lerp(particleData.scatteredPos[i3 + 2], particleData.gridPos[i3 + 2], convergeProgress);

                // Subtle drift that decays as they converge
                const driftDecay = 1 - convergeProgress;
                dummy.position.set(
                    x + Math.sin(time * 0.3 + phase) * 0.5 * driftDecay,
                    y + Math.cos(time * 0.25 + phase) * 0.3 * driftDecay,
                    z
                );
                dummy.scale.setScalar(particleData.sizes[i]);
                dummy.updateMatrix();
                convergingRef.current.setMatrixAt(i, dummy.matrix);
            }
            convergingRef.current.instanceMatrix.needsUpdate = true;
        }

        // Grid floor points
        if (gridRef.current) {
            const mat = gridRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * convergeProgress * 0.2 - mat.opacity) * lerpRate;

            for (let i = 0; i < GRID_POINT_COUNT; i++) {
                dummy.position.set(
                    gridData.positions[i * 3],
                    gridData.positions[i * 3 + 1],
                    gridData.positions[i * 3 + 2]
                );
                dummy.scale.setScalar(gridData.sizes[i]);
                dummy.updateMatrix();
                gridRef.current.setMatrixAt(i, dummy.matrix);
            }
            gridRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Warm golden key light — dawn feel */}
            <pointLight
                ref={light1Ref}
                position={[15, 10, -20]}
                intensity={0}
                color="#E8B84A"
                distance={50}
            />
            {/* Secondary warm fill */}
            <pointLight
                ref={light2Ref}
                position={[-10, 5, -30]}
                intensity={0}
                color="#D4A04A"
                distance={40}
            />
            {/* Deep ambient */}
            <ambientLight intensity={0.015} color="#2A1A0A" />

            {/* Warm atmospheric glow */}
            <mesh ref={glowRef} position={[5, 3, -25]}>
                <sphereGeometry args={[20, 16, 16]} />
                <meshBasicMaterial color="#2A1A0A" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Converging particles — chaos to order */}
            <instancedMesh ref={convergingRef} args={[undefined, undefined, CONVERGING_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshStandardMaterial
                    color="#E8B84A"
                    emissive="#D4A04A"
                    emissiveIntensity={0.6}
                    transparent
                    opacity={0}
                    roughness={0.8}
                />
            </instancedMesh>

            {/* Grid floor points — emerging structure */}
            <instancedMesh ref={gridRef} args={[undefined, undefined, GRID_POINT_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial color="#2A8F6A" transparent opacity={0} depthWrite={false} />
            </instancedMesh>
        </group>
    );
}
