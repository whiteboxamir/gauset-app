'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WorldProps {
    visibility: Float32Array;
    progress: Float32Array;
    index: number;
}

const SHARD_COUNT = 40;

// Target positions: shards assemble into an architectural structure
function generateAssemblyTargets() {
    const targets = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
        // Arrange into a cathedral-like structure
        const ring = Math.floor(i / 8);
        const angle = (i % 8) / 8 * Math.PI * 2;
        const radius = 3 + ring * 2;
        const height = (i % 5 - 2) * 2;

        targets.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius - 8
        ));
    }
    return targets;
}

// Scattered start positions (same as fracture)
function generateScatterPositions() {
    const positions = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
        positions.push(new THREE.Vector3(
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30 - 5
        ));
    }
    return positions;
}

export function AssemblyWorld({ visibility, progress, index }: WorldProps) {
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const wireRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const targets = useMemo(() => generateAssemblyTargets(), []);
    const scattered = useMemo(() => generateScatterPositions(), []);
    const currentPositions = useMemo(
        () => scattered.map(p => p.clone()),
        [scattered]
    );

    useFrame((state) => {
        const vis = visibility[index];
        if (!groupRef.current) return;

        if (vis <= 0) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        const prog = progress[index]; // 0–1: shards fly inward

        if (!meshRef.current) return;

        for (let i = 0; i < SHARD_COUNT; i++) {
            // Lerp from scattered to target based on progress
            const eased = prog * prog * (3 - 2 * prog); // smoothstep

            currentPositions[i].lerpVectors(scattered[i], targets[i], eased);

            dummy.position.copy(currentPositions[i]);

            // Rotation settles as pieces lock in
            const rotScale = 1 - eased;
            dummy.rotation.set(
                rotScale * Math.sin(i * 0.5) * Math.PI,
                rotScale * Math.cos(i * 0.3) * Math.PI,
                rotScale * Math.sin(i * 0.7) * Math.PI * 0.5
            );

            // Scale up slightly as they assemble
            const s = 0.8 + eased * 0.5;
            dummy.scale.set(s, s * 1.5, 0.08);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            if (wireRef.current) {
                wireRef.current.setMatrixAt(i, dummy.matrix);
            }
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (wireRef.current) {
            wireRef.current.instanceMatrix.needsUpdate = true;
        }

        // Material fade
        const mat = meshRef.current.material as THREE.MeshStandardMaterial;
        mat.opacity = vis * 0.8;

        if (wireRef.current) {
            const wireMat = wireRef.current.material as THREE.MeshBasicMaterial;
            wireMat.opacity = vis * prog * 0.5; // Wireframe fades in as assembly completes
        }
    });

    return (
        <group ref={groupRef}>
            {/* Cathedral gold light — single unified source */}
            <directionalLight
                position={[0, 12, -5]}
                intensity={1.2}
                color="#C9A84C"
                castShadow={false}
            />

            {/* Warm ambient fill */}
            <ambientLight intensity={0.15} color="#2A2520" />

            {/* God-ray hint — point light along central axis */}
            <pointLight
                position={[0, 0, -12]}
                intensity={0.8}
                color="#D4A04A"
                distance={30}
            />

            {/* Assembling stone shards */}
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, SHARD_COUNT]}
                frustumCulled={false}
            >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                    color="#2A2520"
                    metalness={0.1}
                    roughness={0.6}
                    transparent
                    opacity={0.8}
                />
            </instancedMesh>

            {/* Green wireframe overlay — Gauset engine scan lines */}
            <instancedMesh
                ref={wireRef}
                args={[undefined, undefined, SHARD_COUNT]}
                frustumCulled={false}
            >
                <boxGeometry args={[1.02, 1.02, 1.02]} />
                <meshBasicMaterial
                    color="#00ff9d"
                    wireframe
                    transparent
                    opacity={0}
                />
            </instancedMesh>

            {/* Ground fog plane */}
            <mesh position={[0, -6, -8]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[40, 30]} />
                <meshBasicMaterial
                    color="#2A2520"
                    transparent
                    opacity={0.1}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
}
