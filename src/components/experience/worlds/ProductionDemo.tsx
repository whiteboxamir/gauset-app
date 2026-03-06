'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
  PRODUCTION DEMO — World Reuse Visualization
  
  Shows the same persistent world (Conquistador terrain)
  with multiple camera paths overlaid — demonstrating
  that one world yields multiple shots.
  
  Camera paths are visible as glowing splines.
  Moving dots represent active camera positions.
  Faint wireframe outlines show production control.
*/

const TERRAIN_SEGMENTS = 30;

export function ProductionDemo({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);
    const terrainRef = useRef<THREE.Mesh>(null);
    const wireTerrainRef = useRef<THREE.Mesh>(null);
    const path1LineRef = useRef<THREE.Line>(null);
    const path2LineRef = useRef<THREE.Line>(null);
    const dot1Ref = useRef<THREE.Mesh>(null);
    const dot2Ref = useRef<THREE.Mesh>(null);
    const structureWireRef = useRef<THREE.Group>(null);

    // Two camera paths through the same world
    const curve1 = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-12, 0, -20),
            new THREE.Vector3(-6, 2, -30),
            new THREE.Vector3(0, 4, -38),
            new THREE.Vector3(8, 2, -42),
            new THREE.Vector3(14, 0, -35),
        ]);
    }, []);

    const curve2 = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(10, 1, -22),
            new THREE.Vector3(4, 3, -28),
            new THREE.Vector3(-2, 5, -35),
            new THREE.Vector3(-8, 3, -40),
            new THREE.Vector3(-12, 1, -45),
        ]);
    }, []);

    const pathGeo1 = useMemo(() => {
        return new THREE.BufferGeometry().setFromPoints(curve1.getPoints(80));
    }, [curve1]);

    const pathGeo2 = useMemo(() => {
        return new THREE.BufferGeometry().setFromPoints(curve2.getPoints(80));
    }, [curve2]);

    // Persistent terrain (same feel as Conquistador but with wireframe overlay)
    const terrainGeo = useMemo(() => {
        const geo = new THREE.PlaneGeometry(80, 55, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const height = Math.sin(x * 0.1) * 0.8 +
                Math.cos(y * 0.15 + 1.5) * 0.6 +
                Math.sin(x * 0.05 + y * 0.08) * 1.2;
            pos.setZ(i, height);
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    // Structure wireframes — suggest persistent architecture
    const structurePositions = useMemo(() => [
        { pos: [-15, -2, -45], scale: [3, 6, 3] },
        { pos: [12, -1, -50], scale: [4, 8, 3] },
        { pos: [-5, -2, -55], scale: [5, 5, 4] },
        { pos: [20, -2, -42], scale: [2, 7, 2] },
        { pos: [-20, -1, -38], scale: [3, 4, 3] },
    ], []);

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
        const fadeIn = smootherstep(0.63, 0.72, t);
        const fadeOut = 1 - smootherstep(0.83, 0.88, t);
        const visibility = fadeIn * fadeOut;

        if (!groupRef.current) return;

        if (visibility <= 0.001) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Terrain — damped
        if (terrainRef.current) {
            const mat = terrainRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity += (visibility * 0.7 - mat.opacity) * lerpRate;
        }

        // Wireframe terrain overlay — damped
        if (wireTerrainRef.current) {
            const mat = wireTerrainRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * 0.08 - mat.opacity) * lerpRate;
        }

        // Camera path 1 — amber, damped
        if (path1LineRef.current) {
            const mat = path1LineRef.current.material as THREE.LineBasicMaterial;
            mat.opacity += (visibility * 0.5 - mat.opacity) * lerpRate;
        }

        // Camera path 2 — teal, damped
        if (path2LineRef.current) {
            const mat = path2LineRef.current.material as THREE.LineBasicMaterial;
            mat.opacity += (visibility * 0.4 - mat.opacity) * lerpRate;
        }

        // Moving camera dots
        if (dot1Ref.current) {
            const progress1 = (time * 0.04) % 1;
            const pos1 = curve1.getPoint(progress1);
            dot1Ref.current.position.copy(pos1);
            const mat = dot1Ref.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * 0.9 - mat.opacity) * lerpRate;
        }

        if (dot2Ref.current) {
            const progress2 = ((time * 0.03) + 0.4) % 1;
            const pos2 = curve2.getPoint(progress2);
            dot2Ref.current.position.copy(pos2);
            const mat = dot2Ref.current.material as THREE.MeshBasicMaterial;
            mat.opacity += (visibility * 0.8 - mat.opacity) * lerpRate;
        }

        // Structure wireframes — damped
        if (structureWireRef.current) {
            structureWireRef.current.children.forEach((child) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshBasicMaterial;
                mat.opacity += (visibility * 0.12 - mat.opacity) * lerpRate;
            });
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Subdued lighting — focus on production tools */}
            <directionalLight position={[-20, 8, -30]} intensity={0} color="#D4A04A" />
            <ambientLight intensity={0} color="#1A1A1A" />

            {/* Teal overhead glow — production identity */}
            <pointLight position={[0, 12, -35]} intensity={0.06} color="#2A8F6A" distance={30} />
            {/* Dark underlight — depth contrast from below */}
            <pointLight position={[0, -8, -35]} intensity={0.02} color="#0A1A15" distance={25} />

            {/* Atmospheric depth haze — tech/studio feel */}
            <mesh position={[0, 0, -40]}>
                <sphereGeometry args={[20, 12, 12]} />
                <meshBasicMaterial color="#0A1510" transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Persistent terrain */}
            <mesh
                ref={terrainRef}
                geometry={terrainGeo}
                position={[0, -5, -35]}
                rotation={[-Math.PI / 2.3, 0, 0]}
            >
                <meshStandardMaterial
                    color="#3D3525"
                    roughness={0.85}
                    metalness={0.08}
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Wireframe overlay — showing production scaffolding */}
            <mesh
                ref={wireTerrainRef}
                geometry={terrainGeo}
                position={[0, -4.95, -35]}
                rotation={[-Math.PI / 2.3, 0, 0]}
            >
                <meshBasicMaterial
                    color="#2A8F6A"
                    wireframe
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Camera path 1 — amber (Shot A) */}
            {/* @ts-ignore — R3F line element */}
            <line ref={path1LineRef} geometry={pathGeo1}>
                {/* @ts-ignore */}
                <lineBasicMaterial color="#D4A04A" transparent opacity={0} />
            </line>

            {/* Camera path 2 — teal (Shot B) */}
            {/* @ts-ignore — R3F line element */}
            <line ref={path2LineRef} geometry={pathGeo2}>
                {/* @ts-ignore */}
                <lineBasicMaterial color="#2A8F6A" transparent opacity={0} />
            </line>

            {/* Moving camera dot — Shot A */}
            <mesh ref={dot1Ref}>
                <sphereGeometry args={[0.2, 10, 10]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0} />
            </mesh>

            {/* Moving camera dot — Shot B */}
            <mesh ref={dot2Ref}>
                <sphereGeometry args={[0.2, 10, 10]} />
                <meshBasicMaterial color="#2A8F6A" transparent opacity={0} />
            </mesh>

            {/* Structure wireframes — persistent world elements */}
            <group ref={structureWireRef}>
                {structurePositions.map((s, i) => (
                    <mesh key={i} position={s.pos as [number, number, number]}>
                        <boxGeometry args={s.scale as [number, number, number]} />
                        <meshBasicMaterial
                            color="#E8DDD0"
                            wireframe
                            transparent
                            opacity={0}
                        />
                    </mesh>
                ))}
            </group>

            {/* Ambient data sparkle — tiny particles floating along camera paths */}
            <instancedMesh args={[undefined, undefined, 80]} frustumCulled={false}>
                <sphereGeometry args={[1, 3, 3]} />
                <meshBasicMaterial color="#2A8F6A" transparent opacity={0.02} depthWrite={false} />
            </instancedMesh>

            {/* Camera dolly rig — two track rails + camera box */}
            <group>
                {/* Left rail */}
                <mesh position={[-8, -4.8, -30]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.03, 0.03, 15, 6]} />
                    <meshStandardMaterial color="#2A2A2A" metalness={0.9} roughness={0.2} transparent opacity={0} />
                </mesh>
                {/* Right rail */}
                <mesh position={[-7, -4.8, -30]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.03, 0.03, 15, 6]} />
                    <meshStandardMaterial color="#2A2A2A" metalness={0.9} roughness={0.2} transparent opacity={0} />
                </mesh>
                {/* Camera body on dolly */}
                <mesh position={[-7.5, -4.2, -28]}>
                    <boxGeometry args={[0.8, 0.5, 0.6]} />
                    <meshStandardMaterial color="#1A1A1A" metalness={0.7} roughness={0.3} transparent opacity={0} />
                </mesh>
                {/* Lens */}
                <mesh position={[-7.5, -4.2, -27.6]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.12, 0.15, 0.4, 8]} />
                    <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.15} transparent opacity={0} />
                </mesh>
            </group>

            {/* Crew silhouettes */}
            <group>
                {[{ x: -3, z: -25 }, { x: 5, z: -30 }, { x: -9, z: -35 }].map((pos, i) => (
                    <group key={i} position={[pos.x, -4, pos.z]}>
                        <mesh position={[0, 1.2, 0]}>
                            <capsuleGeometry args={[0.25, 1.0, 4, 8]} />
                            <meshStandardMaterial color="#1A1A1A" emissive="#2A8F6A" emissiveIntensity={0.1} transparent opacity={0} />
                        </mesh>
                        <mesh position={[0, 2.1, 0]}>
                            <sphereGeometry args={[0.2, 6, 6]} />
                            <meshStandardMaterial color="#1A1A1A" emissive="#2A8F6A" emissiveIntensity={0.1} transparent opacity={0} />
                        </mesh>
                    </group>
                ))}
            </group>

            {/* Monitor / playback screen */}
            <mesh position={[10, -2, -32]} rotation={[0, -0.4, 0]}>
                <planeGeometry args={[2.5, 1.5]} />
                <meshStandardMaterial color="#0A0A0A" emissive="#1A8F8F" emissiveIntensity={0.3} transparent opacity={0} />
            </mesh>
        </group>
    );
}
