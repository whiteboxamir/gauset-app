'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WorldProps {
    visibility: Float32Array;
    progress: Float32Array;
    index: number;
}

const SHARD_COUNT = 50;
const GLITCH_PARTICLE_COUNT = 200;

// Broken scenes, glitching geometry, red/orange instability
export function FractureWorld({ visibility, progress, index }: WorldProps) {
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const edgesRef = useRef<THREE.InstancedMesh>(null);
    const glitchRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Shard data — broken screen fragments
    const shards = useMemo(() => {
        const data = [];
        for (let i = 0; i < SHARD_COUNT; i++) {
            const basePos = new THREE.Vector3(
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 25 - 5
            );
            const scale = 0.4 + Math.random() * 2;
            const rotation = new THREE.Euler(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            const speed = 0.3 + Math.random() * 0.8;
            const phase = Math.random() * Math.PI * 2;
            const glitchFreq = 2 + Math.random() * 8; // How often it jitters
            const glitchAmp = 0.1 + Math.random() * 0.5; // How far it displaces

            // Red/orange color palette
            const temp = Math.random();
            const color = temp > 0.6
                ? new THREE.Color('#ff4444') // hot red
                : temp > 0.3
                    ? new THREE.Color('#ff8833') // orange
                    : new THREE.Color('#cc2200'); // deep red

            data.push({ basePos, scale, rotation, speed, phase, color, glitchFreq, glitchAmp });
        }
        return data;
    }, []);

    // Small glitch particles — flying debris/sparks
    const glitchParticles = useMemo(() => {
        const positions = new Float32Array(GLITCH_PARTICLE_COUNT * 3);
        const velocities = new Float32Array(GLITCH_PARTICLE_COUNT * 3);
        const sizes = new Float32Array(GLITCH_PARTICLE_COUNT);

        for (let i = 0; i < GLITCH_PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 40;
            positions[i3 + 1] = (Math.random() - 0.5) * 30;
            positions[i3 + 2] = (Math.random() - 0.5) * 30 - 5;
            velocities[i3] = (Math.random() - 0.5) * 0.05;
            velocities[i3 + 1] = (Math.random() - 0.5) * 0.03;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
            sizes[i] = 0.02 + Math.random() * 0.06;
        }
        return { positions, velocities, sizes };
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
        const prog = progress[index];

        if (!meshRef.current) return;

        for (let i = 0; i < SHARD_COUNT; i++) {
            const shard = shards[i];

            // Erratic floating
            const floatY = Math.sin(time * shard.speed + shard.phase) * 0.7;
            const floatX = Math.cos(time * shard.speed * 0.7 + shard.phase) * 0.5;

            // Glitch displacement — sudden jitter
            const glitchTime = Math.sin(time * shard.glitchFreq + shard.phase);
            const glitchX = glitchTime > 0.8 ? (Math.random() - 0.5) * shard.glitchAmp * 3 : 0;
            const glitchY = glitchTime > 0.85 ? (Math.random() - 0.5) * shard.glitchAmp * 2 : 0;

            // Scroll-driven drift — shards scatter as you scroll deeper
            const scrollDrift = prog * 5;

            dummy.position.set(
                shard.basePos.x + floatX - scrollDrift + glitchX,
                shard.basePos.y + floatY + glitchY,
                shard.basePos.z
            );

            // Fast, erratic rotation
            dummy.rotation.set(
                shard.rotation.x + time * 0.12,
                shard.rotation.y + time * 0.08,
                shard.rotation.z + time * 0.05
            );

            dummy.scale.setScalar(shard.scale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            if (edgesRef.current) {
                edgesRef.current.setMatrixAt(i, dummy.matrix);
            }
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (edgesRef.current) {
            edgesRef.current.instanceMatrix.needsUpdate = true;
        }

        // Opacity flicker — intermittent static effect
        const flicker = Math.sin(time * 15) > 0.7 ? 0.85 : 1;
        const mat = meshRef.current.material as THREE.MeshStandardMaterial;
        mat.opacity = vis * 0.75 * flicker;

        if (edgesRef.current) {
            const edgeMat = edgesRef.current.material as THREE.MeshBasicMaterial;
            edgeMat.opacity = vis * 0.4 * flicker;
        }

        // Animate glitch particles
        if (glitchRef.current) {
            for (let i = 0; i < GLITCH_PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                glitchParticles.positions[i3] += glitchParticles.velocities[i3];
                glitchParticles.positions[i3 + 1] += glitchParticles.velocities[i3 + 1];
                glitchParticles.positions[i3 + 2] += glitchParticles.velocities[i3 + 2];

                // Wrap around
                if (Math.abs(glitchParticles.positions[i3]) > 25) glitchParticles.velocities[i3] *= -1;
                if (Math.abs(glitchParticles.positions[i3 + 1]) > 18) glitchParticles.velocities[i3 + 1] *= -1;

                dummy.position.set(
                    glitchParticles.positions[i3],
                    glitchParticles.positions[i3 + 1],
                    glitchParticles.positions[i3 + 2]
                );
                dummy.scale.setScalar(glitchParticles.sizes[i]);
                dummy.updateMatrix();
                glitchRef.current.setMatrixAt(i, dummy.matrix);
            }
            glitchRef.current.instanceMatrix.needsUpdate = true;
            const gpMat = glitchRef.current.material as THREE.MeshBasicMaterial;
            gpMat.opacity = vis * 0.5;
        }
    });

    return (
        <group ref={groupRef}>
            {/* Harsh red key light — aggressive, from left */}
            <pointLight position={[-12, 5, -3]} intensity={1.2} color="#ff4444" distance={35} />
            {/* Orange counter from right — conflicting */}
            <pointLight position={[10, -3, -5]} intensity={0.9} color="#ff8833" distance={30} />
            {/* Deep red from below — ominous */}
            <pointLight position={[0, -8, -8]} intensity={0.5} color="#cc2200" distance={25} />
            {/* Cool offset — creates tension */}
            <pointLight position={[8, 8, -10]} intensity={0.3} color="#ff6644" distance={20} />

            {/* Minimal ambient — just enough to see shapes */}
            <ambientLight intensity={0.03} color="#1a0808" />

            {/* Broken screen shards — glass-like fragments */}
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, SHARD_COUNT]}
                frustumCulled={false}
            >
                <boxGeometry args={[1, 1.8, 0.06]} />
                <meshStandardMaterial
                    color="#1a0808"
                    metalness={0.4}
                    roughness={0.15}
                    transparent
                    opacity={0.75}
                    envMapIntensity={0.6}
                />
            </instancedMesh>

            {/* Wireframe edges — scan-line / broken renders */}
            <instancedMesh
                ref={edgesRef}
                args={[undefined, undefined, SHARD_COUNT]}
                frustumCulled={false}
            >
                <boxGeometry args={[1.02, 1.82, 0.07]} />
                <meshBasicMaterial
                    color="#ff6644"
                    wireframe
                    transparent
                    opacity={0.4}
                />
            </instancedMesh>

            {/* Flying debris particles */}
            <instancedMesh
                ref={glitchRef}
                args={[undefined, undefined, GLITCH_PARTICLE_COUNT]}
                frustumCulled={false}
            >
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial
                    color="#ff8833"
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                />
            </instancedMesh>

            {/* Red atmospheric haze */}
            <mesh position={[0, 0, -12]}>
                <planeGeometry args={[60, 35]} />
                <meshBasicMaterial
                    color="#1a0505"
                    transparent
                    opacity={0.2}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Flickering warning plane — intermittent flash */}
            <mesh position={[0, 0, -15]}>
                <planeGeometry args={[80, 50]} />
                <meshBasicMaterial
                    color="#ff2200"
                    transparent
                    opacity={0.02}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}
