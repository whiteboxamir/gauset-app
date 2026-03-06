'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  CONQUISTADOR WORLD — "Conquistador"
  
  Expansive. Environmental. Historical tone.
  A vast terrain with distant ancient structures.
  Golden-hour light, desert haze, enormous scale.
  Camera pulls back and rises to reveal the world.
*/

const STRUCTURE_COUNT = 24;
const WIND_PARTICLE_COUNT = 800;
const TERRAIN_SEGMENTS = 40;

const _color = new THREE.Color();

export function ConquistadorWorld({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const terrainRef = useRef<THREE.Mesh>(null);
    const structuresRef = useRef<THREE.InstancedMesh>(null);
    const windRef = useRef<THREE.InstancedMesh>(null);
    const horizonRef = useRef<THREE.Mesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Ancient structures — distant skyline
    const structureData = useMemo(() => {
        const data = [];
        for (let i = 0; i < STRUCTURE_COUNT; i++) {
            const angle = (i / STRUCTURE_COUNT) * Math.PI * 1.2 - Math.PI * 0.6;
            const distance = 18 + Math.random() * 25;
            const height = 2 + Math.random() * 8;

            data.push({
                position: new THREE.Vector3(
                    Math.sin(angle) * distance,
                    -4 + height * 0.5,
                    -30 - Math.cos(angle) * distance * 0.6
                ),
                scale: new THREE.Vector3(
                    1 + Math.random() * 2,
                    height,
                    1 + Math.random() * 2
                ),
                rotation: Math.random() * 0.1 - 0.05,
            });
        }
        return data;
    }, []);

    // Wind-blown particles
    const windData = useMemo(() => {
        const d = {
            positions: new Float32Array(WIND_PARTICLE_COUNT * 3),
            sizes: new Float32Array(WIND_PARTICLE_COUNT),
            speeds: new Float32Array(WIND_PARTICLE_COUNT),
            phases: new Float32Array(WIND_PARTICLE_COUNT),
        };
        for (let i = 0; i < WIND_PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            d.positions[i3] = (Math.random() - 0.5) * 80;
            d.positions[i3 + 1] = -4 + Math.random() * 12;
            d.positions[i3 + 2] = -20 - Math.random() * 50;
            d.sizes[i] = 0.01 + Math.random() * 0.04;
            d.speeds[i] = 0.5 + Math.random() * 1.5;
            d.phases[i] = Math.random() * Math.PI * 2;
        }
        return d;
    }, []);

    // Terrain vertex displacement for undulation
    const terrainGeo = useMemo(() => {
        const geo = new THREE.PlaneGeometry(100, 70, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            // Gentle rolling hills
            const height = Math.sin(x * 0.1) * 0.8 +
                Math.cos(y * 0.15 + 1.5) * 0.6 +
                Math.sin(x * 0.05 + y * 0.08) * 1.2;
            pos.setZ(i, height);
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    // Smootherstep — C2-continuous quintic
    const smootherstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-5 * delta);

        // Wider, quintic-eased fade windows
        const fadeIn = smootherstep(0.50, 0.59, t);
        const fadeOut = 1 - smootherstep(0.64, 0.71, t);
        const visibility = fadeIn * fadeOut;

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Terrain — damped opacity
        if (terrainRef.current) {
            const mat = terrainRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity += (visibility * 0.95 - mat.opacity) * lerpRate;
        }

        // Structures — damped
        if (structuresRef.current) {
            const mat = structuresRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity += (visibility * 0.7 - mat.opacity) * lerpRate;

            for (let i = 0; i < STRUCTURE_COUNT; i++) {
                const s = structureData[i];
                dummy.position.copy(s.position);
                dummy.scale.copy(s.scale);
                dummy.rotation.set(0, s.rotation + time * 0.002, 0);
                dummy.updateMatrix();
                structuresRef.current.setMatrixAt(i, dummy.matrix);
            }
            structuresRef.current.instanceMatrix.needsUpdate = true;
        }

        // Wind particles — horizontal drift, damped
        if (windRef.current) {
            const windMat = windRef.current.material as THREE.MeshBasicMaterial;
            windMat.opacity += (visibility * 0.3 - windMat.opacity) * lerpRate;

            for (let i = 0; i < WIND_PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                const speed = windData.speeds[i];
                const phase = windData.phases[i];

                // Horizontal wind drift
                let px = windData.positions[i3] + time * speed * 0.3;
                const py = windData.positions[i3 + 1] + Math.sin(time * 0.5 + phase) * 0.2;
                const pz = windData.positions[i3 + 2];

                // Wrap horizontally
                if (px > 40) px -= 80;

                dummy.position.set(px, py, pz);
                dummy.scale.setScalar(windData.sizes[i]);
                dummy.updateMatrix();
                windRef.current.setMatrixAt(i, dummy.matrix);
            }
            windRef.current.instanceMatrix.needsUpdate = true;
        }

        // Horizon glow pulse — damped
        if (horizonRef.current) {
            const mat = horizonRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * (0.06 + Math.sin(time * 0.2) * 0.02) - mat.opacity) * lerpRate;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Golden-hour sun — low angle, warm */}
            <directionalLight
                position={[-25, 5, -35]}
                intensity={0}
                color="#D4A04A"
            />
            {/* Sky fill */}
            <hemisphereLight args={['#6B5530', '#1A1510', 0]} />
            {/* Warm ambient */}
            <ambientLight intensity={0} color="#2A2010" />

            {/* Sun-direction rim — separates terrain from void */}
            <pointLight position={[-30, 0, -50]} intensity={0.05} color="#D4A04A" distance={60} />
            {/* Opposite cold fill — depth contrast */}
            <pointLight position={[25, 10, -30]} intensity={0.02} color="#3A4A5A" distance={40} />

            {/* Volumetric golden light bar — horizon glow band */}
            <mesh position={[0, -2, -55]} rotation={[0, 0, 0]}>
                <planeGeometry args={[100, 8]} />
                <meshBasicMaterial
                    color="#D4A04A"
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Near atmospheric haze — foreground depth */}
            <mesh position={[0, -2, -25]}>
                <sphereGeometry args={[15, 12, 12]} />
                <meshBasicMaterial color="#3A3020" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Mid depth haze — between terrain and structures */}
            <mesh position={[0, 0, -45]}>
                <sphereGeometry args={[25, 12, 12]} />
                <meshBasicMaterial color="#2A2015" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Far atmospheric haze — horizon depth */}
            <mesh position={[0, 2, -70]}>
                <sphereGeometry args={[40, 12, 12]} />
                <meshBasicMaterial color="#1A1510" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Terrain — rolling desert/grassland */}
            <mesh
                ref={terrainRef}
                geometry={terrainGeo}
                position={[0, -5, -35]}
                rotation={[-Math.PI / 2.3, 0, 0]}
            >
                <meshStandardMaterial
                    color="#3A3020"
                    roughness={0.9}
                    metalness={0.05}
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Ancient structures — distant temples/fortifications */}
            <instancedMesh ref={structuresRef} args={[undefined, undefined, STRUCTURE_COUNT]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                    color="#4A3A28"
                    roughness={0.85}
                    metalness={0.15}
                    transparent
                    opacity={0}
                />
            </instancedMesh>

            {/* Horizon glow — golden band */}
            <mesh ref={horizonRef} position={[0, -1, -65]}>
                <planeGeometry args={[120, 20]} />
                <meshBasicMaterial
                    color="#D4A04A"
                    transparent
                    opacity={0}
                />
            </mesh>

            {/* Sky dome */}
            <mesh position={[0, 15, -40]}>
                <sphereGeometry args={[60, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshBasicMaterial
                    color="#1A1510"
                    transparent
                    opacity={0.4}
                    side={THREE.BackSide}
                />
            </mesh>

            {/* Wind-blown particles */}
            <instancedMesh ref={windRef} args={[undefined, undefined, WIND_PARTICLE_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial color="#D4C4A0" transparent opacity={0} depthWrite={false} />
            </instancedMesh>

            {/* Distant high-altitude particles — sky depth */}
            <instancedMesh args={[undefined, undefined, 60]} frustumCulled={false}>
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial color="#6B5530" transparent opacity={0.015} depthWrite={false} />
            </instancedMesh>
        </group>
    );
}
