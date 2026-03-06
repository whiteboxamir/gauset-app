'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  TYSON WORLD — "Lightning in a Bottle"
  
  Intimate. Grounded. Cinematic realism.
  A lone figure in a boxing ring under harsh tungsten light.
  Everything outside the ring is void.
  Warm haze drifts through the light cone.
*/

const HAZE_COUNT = 600;

// Helper component to render R3F line elements with proper TS handling
function RopeLine({ geometry, onRef }: { geometry: THREE.BufferGeometry; onRef: (el: any) => void }) {
    // @ts-ignore — R3F line element, not SVG
    return <line ref={onRef} geometry={geometry}><lineBasicMaterial color="#E8D5B8" transparent opacity={0} /></line>;
}

export function TysonWorld({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const hazeRef = useRef<THREE.InstancedMesh>(null);
    const figureRef = useRef<THREE.Group>(null);
    const ropeRefs = useRef<(THREE.Line | null)[]>([]);
    const ringFloorRef = useRef<THREE.Mesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Ring dimensions
    const ringSize = 6;
    const ringY = -4;

    // Haze particles — warm, slow drift inside the light cone
    const hazeData = useMemo(() => {
        const d = {
            positions: new Float32Array(HAZE_COUNT * 3),
            sizes: new Float32Array(HAZE_COUNT),
            speeds: new Float32Array(HAZE_COUNT * 3),
            phases: new Float32Array(HAZE_COUNT),
        };
        for (let i = 0; i < HAZE_COUNT; i++) {
            const i3 = i * 3;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 5;
            d.positions[i3] = Math.cos(angle) * radius;
            d.positions[i3 + 1] = ringY + 1 + Math.random() * 8;
            d.positions[i3 + 2] = Math.sin(angle) * radius - 25;
            d.sizes[i] = 0.02 + Math.random() * 0.06;
            d.speeds[i3] = (Math.random() - 0.5) * 0.03;
            d.speeds[i3 + 1] = Math.random() * 0.01 + 0.005;
            d.speeds[i3 + 2] = (Math.random() - 0.5) * 0.02;
            d.phases[i] = Math.random() * Math.PI * 2;
        }
        return d;
    }, [ringY]);

    // Ring rope geometry — 4 horizontal ropes on each side
    const ropeGeometries = useMemo(() => {
        const ropes: THREE.BufferGeometry[] = [];
        const heights = [ringY + 1.5, ringY + 2.5, ringY + 3.5, ringY + 4.5];
        const corners = [
            new THREE.Vector3(-ringSize, 0, -25 - ringSize),
            new THREE.Vector3(ringSize, 0, -25 - ringSize),
            new THREE.Vector3(ringSize, 0, -25 + ringSize),
            new THREE.Vector3(-ringSize, 0, -25 + ringSize),
        ];

        for (const h of heights) {
            const points: THREE.Vector3[] = [];
            for (let side = 0; side < 4; side++) {
                const start = corners[side].clone();
                const end = corners[(side + 1) % 4].clone();
                start.y = h;
                end.y = h;
                const steps = 15;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const p = new THREE.Vector3().lerpVectors(start, end, t);
                    const sag = Math.sin(t * Math.PI) * 0.12;
                    p.y -= sag;
                    points.push(p);
                }
            }
            points.push(points[0].clone());
            ropes.push(new THREE.BufferGeometry().setFromPoints(points));
        }
        return ropes;
    }, [ringSize, ringY]);

    // Smootherstep — C2-continuous quintic
    const smootherstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-5 * delta);

        // Wider fade windows with quintic easing for organic feel
        const fadeIn = smootherstep(0.38, 0.47, t);
        const fadeOut = 1 - smootherstep(0.52, 0.59, t);
        const visibility = fadeIn * fadeOut;

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        if (ringFloorRef.current) {
            const mat = ringFloorRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity += (visibility * 0.9 - mat.opacity) * lerpRate;
        }

        ropeRefs.current.forEach((rope) => {
            if (!rope) return;
            const mat = rope.material as THREE.LineBasicMaterial;
            mat.opacity += (visibility * 0.35 - mat.opacity) * lerpRate;
        });

        if (figureRef.current) {
            figureRef.current.children.forEach((child) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.opacity += (visibility * 0.7 - mat.opacity) * lerpRate;
            });
            figureRef.current.position.y = Math.sin(time * 0.8) * 0.03;
            figureRef.current.rotation.y = time * 0.05;
        }

        if (hazeRef.current) {
            const hazeMat = hazeRef.current.material as THREE.MeshBasicMaterial;
            hazeMat.opacity = visibility * 0.25;

            for (let i = 0; i < HAZE_COUNT; i++) {
                const i3 = i * 3;
                const phase = hazeData.phases[i];
                dummy.position.set(
                    hazeData.positions[i3] + Math.sin(time * hazeData.speeds[i3] + phase) * 0.5,
                    hazeData.positions[i3 + 1] + time * hazeData.speeds[i3 + 1] * 0.3,
                    hazeData.positions[i3 + 2] + Math.cos(time * hazeData.speeds[i3 + 2] + phase) * 0.3
                );
                if (dummy.position.y > ringY + 10) {
                    dummy.position.y = ringY + 1;
                }
                dummy.scale.setScalar(hazeData.sizes[i]);
                dummy.updateMatrix();
                hazeRef.current.setMatrixAt(i, dummy.matrix);
            }
            hazeRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Primary tungsten spot — harsh, directional */}
            <spotLight
                position={[2, 14, -25]}
                angle={0.5}
                penumbra={0.6}
                intensity={0}
                color="#FFD4A0"
                distance={30}
                castShadow={false}
            />
            {/* Cool backlight — rim separation from void */}
            <pointLight position={[-4, 6, -32]} intensity={0} color="#8090B0" distance={18} />

            {/* Corner rim lights — subtle, warm, increase depth */}
            <pointLight position={[-ringSize, ringY + 3, -25 - ringSize]} intensity={0} color="#FFD4A0" distance={8} />
            <pointLight position={[ringSize, ringY + 3, -25 + ringSize]} intensity={0} color="#FFD4A0" distance={8} />

            {/* Deep background darkness anchor */}
            <pointLight position={[0, -8, -40]} intensity={0.02} color="#0A0608" distance={30} />

            {/* Visible spotlight cone — volumetric feel */}
            <mesh position={[2, 6, -25]} rotation={[0, 0, 0]}>
                <coneGeometry args={[5, 12, 16, 1, true]} />
                <meshBasicMaterial
                    color="#FFD4A0"
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Ring floor */}
            <mesh
                ref={ringFloorRef}
                position={[0, ringY, -25]}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <planeGeometry args={[ringSize * 2, ringSize * 2]} />
                <meshStandardMaterial
                    color="#1A1410"
                    roughness={0.85}
                    metalness={0.1}
                    transparent
                    opacity={0}
                />
            </mesh>

            {/* Ring ropes */}
            {ropeGeometries.map((geo, i) => (
                <RopeLine
                    key={`rope-${i}`}
                    geometry={geo}
                    onRef={(el: any) => { ropeRefs.current[i] = el; }}
                />
            ))}

            {/* Corner posts */}
            {[
                [-ringSize, ringY, -25 - ringSize],
                [ringSize, ringY, -25 - ringSize],
                [ringSize, ringY, -25 + ringSize],
                [-ringSize, ringY, -25 + ringSize],
            ].map((pos, i) => (
                <mesh key={`post-${i}`} position={[pos[0], pos[1] + 2.5, pos[2]]}>
                    <cylinderGeometry args={[0.06, 0.06, 5, 8]} />
                    <meshStandardMaterial
                        color="#888888"
                        metalness={0.8}
                        roughness={0.3}
                        transparent
                        opacity={0}
                    />
                </mesh>
            ))}

            {/* Figure silhouette — boxer stance */}
            <group ref={figureRef} position={[0, ringY, -25]}>
                <mesh position={[0, 1.8, 0]}>
                    <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
                    <meshStandardMaterial
                        color="#0A0A0A"
                        emissive="#FFD4A0"
                        emissiveIntensity={0.05}
                        transparent
                        opacity={0}
                        roughness={0.9}
                    />
                </mesh>
                <mesh position={[0, 2.8, 0]}>
                    <sphereGeometry args={[0.28, 12, 12]} />
                    <meshStandardMaterial
                        color="#0A0A0A"
                        emissive="#FFD4A0"
                        emissiveIntensity={0.05}
                        transparent
                        opacity={0}
                        roughness={0.9}
                    />
                </mesh>
                <mesh position={[-0.35, 2.2, 0.25]} rotation={[0.3, 0, 0.2]}>
                    <capsuleGeometry args={[0.12, 0.7, 4, 6]} />
                    <meshStandardMaterial
                        color="#0A0A0A"
                        emissive="#FFD4A0"
                        emissiveIntensity={0.03}
                        transparent
                        opacity={0}
                    />
                </mesh>
                <mesh position={[0.35, 2.2, 0.25]} rotation={[0.3, 0, -0.2]}>
                    <capsuleGeometry args={[0.12, 0.7, 4, 6]} />
                    <meshStandardMaterial
                        color="#0A0A0A"
                        emissive="#FFD4A0"
                        emissiveIntensity={0.03}
                        transparent
                        opacity={0}
                    />
                </mesh>
                <mesh position={[-0.18, 0.5, 0]}>
                    <capsuleGeometry args={[0.14, 0.8, 4, 6]} />
                    <meshStandardMaterial color="#0A0A0A" transparent opacity={0} />
                </mesh>
                <mesh position={[0.18, 0.5, 0.15]}>
                    <capsuleGeometry args={[0.14, 0.8, 4, 6]} />
                    <meshStandardMaterial color="#0A0A0A" transparent opacity={0} />
                </mesh>
            </group>

            {/* Primary haze — warm, in the light cone */}
            <instancedMesh ref={hazeRef} args={[undefined, undefined, HAZE_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial color="#FFD4A0" transparent opacity={0} depthWrite={false} />
            </instancedMesh>

            {/* Deep void particles — beyond the ring, barely visible */}
            <instancedMesh args={[undefined, undefined, 120]} frustumCulled={false}>
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial color="#1A1020" transparent opacity={0.02} depthWrite={false} />
            </instancedMesh>
        </group>
    );
}
