'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';
import * as THREE from 'three';
import { InsightWorld } from './worlds/InsightWorld';
import { ProductionDemo } from './worlds/ProductionDemo';
import { ClosingWorld } from './worlds/ClosingWorld';

/*
  CINEMATIC SCENE — SIX-PHASE CONVERSION FUNNEL
  
  Scroll 0.00–0.15: HOOK (Void)
    Amber dust, darkness, camera pushes in. "Build worlds. Not clips."
  
  Scroll 0.15–0.30: PROBLEM (Fracture)
    Dust freezes → shards, cold lighting. "AI video is a dead end."
  
  Scroll 0.30–0.45: INSIGHT (Dawn)
    Particles converge, warm golden light. "Production needs a world."
  
  Scroll 0.45–0.65: SOLUTION (Production)
    Architecture assembles, floor grid, camera paths. "Gauset is that layer."
  
  Scroll 0.65–0.85: PROOF (World Reuse)
    Multiple camera paths through persistent terrain. "One world. Infinite shots."
  
  Scroll 0.85–1.00: CTA (Closing)
    Motion decelerates. Single warm light. "Join early access."
    
  Each transition is spatial — you travel through it.
*/

// ─── CONSTANTS ───
const DUST_COUNT = 2000;
const SHARD_COUNT = 35;
const BOKEH_COUNT = 18;
const GRID_LINES = 40;
const FIGURE_COUNT = 5;

// ─── COLORS ───
const AMBER = new THREE.Color('#D4A04A');
const COLD_BLUE = new THREE.Color('#4A6FA5');
const VIOLET = new THREE.Color('#6B4C9A');
const WARM_WHITE = new THREE.Color('#E8DDD0');
const STAGE_GREEN = new THREE.Color('#2A8F6A');
const DARK_WARM = new THREE.Color('#0a0806');
const DARK_COLD = new THREE.Color('#060810');
const DARK_STUDIO = new THREE.Color('#08080a');

const _color = new THREE.Color();
const _vec3 = new THREE.Vector3();
const _lookSmooth = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

// Ken Perlin's smootherstep — C2-continuous, no acceleration discontinuities
function smootherstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// ═══════════════════════════════════════════════
//  BACKGROUND: Atmosphere Transitions
// ═══════════════════════════════════════════════
function AtmosphericBackground({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const warmGlowRef = useRef<THREE.Mesh>(null);
    const coldGlowRef = useRef<THREE.Mesh>(null);
    const studioGlowRef = useRef<THREE.Mesh>(null);
    const deepNebulaRef = useRef<THREE.Mesh>(null);
    const midHazeRef = useRef<THREE.Mesh>(null);
    const nearVeilRef = useRef<THREE.Mesh>(null);

    useFrame(({ clock, scene }) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;

        // Warm glow: visible in void, fades during fracture
        if (warmGlowRef.current) {
            const mat = warmGlowRef.current.material as THREE.MeshBasicMaterial;
            const base = 0.07 + Math.sin(time * 0.15) * 0.015;
            mat.opacity = base * Math.max(0, 1 - t * 3);
        }

        // Cold glow: visible during fracture, fades in production
        // Cold glow — fracture phase only
        if (coldGlowRef.current) {
            const mat = coldGlowRef.current.material as THREE.MeshBasicMaterial;
            const coldFade = smootherstep(0.10, 0.30, t) * (1 - smootherstep(0.30, 0.50, t));
            mat.opacity = coldFade * 0.12;
            _color.lerpColors(COLD_BLUE, VIOLET, Math.sin(time * 0.2) * 0.5 + 0.5);
            mat.color.copy(_color);
        }

        // Studio glow — solution/proof phases
        if (studioGlowRef.current) {
            const mat = studioGlowRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = smootherstep(0.45, 0.55, t) * (1 - smootherstep(0.80, 0.92, t)) * 0.06;
        }

        // ── DEPTH LAYERS ──

        // Deep nebula — very far background, slow drift
        if (deepNebulaRef.current) {
            const mat = deepNebulaRef.current.material as THREE.MeshBasicMaterial;
            const nebulaVis = (1 - smootherstep(0.7, 0.95, t)) * 0.04;
            mat.opacity = nebulaVis + Math.sin(time * 0.08) * 0.005;
            deepNebulaRef.current.position.x = -20 + Math.sin(time * 0.012) * 2;
            deepNebulaRef.current.position.y = 5 + Math.cos(time * 0.01) * 1;
        }

        // Mid haze — atmospheric depth, drifts more than nebula
        if (midHazeRef.current) {
            const mat = midHazeRef.current.material as THREE.MeshBasicMaterial;
            const hazeVis = smootherstep(0.05, 0.25, t) * (1 - smootherstep(0.42, 0.65, t)) * 0.06;
            mat.opacity = hazeVis;
            _color.lerpColors(COLD_BLUE, VIOLET, Math.sin(time * 0.15 + 1.0) * 0.5 + 0.5);
            mat.color.copy(_color);
            midHazeRef.current.position.x = 8 + Math.sin(time * 0.025) * 4;
            midHazeRef.current.position.y = -3 + Math.cos(time * 0.02) * 2;
        }

        // Near veil — foreground depth, parallax drift
        if (nearVeilRef.current) {
            const mat = nearVeilRef.current.material as THREE.MeshBasicMaterial;
            const veilVis = smootherstep(0.10, 0.30, t) * (1 - smootherstep(0.42, 0.55, t)) * 0.035;
            mat.opacity = veilVis;
            nearVeilRef.current.position.x = Math.sin(time * 0.04) * 6;
            nearVeilRef.current.position.y = 2 + Math.cos(time * 0.035) * 3;
        }

        // Fog transitions — smooth six-phase
        const fog = scene.fog as THREE.Fog;
        if (fog) {
            const voidToFracture = smootherstep(0.0, 0.30, t);
            const fractureToInsight = smootherstep(0.25, 0.40, t);
            const insightToSolution = smootherstep(0.40, 0.55, t);
            const solutionToLate = smootherstep(0.60, 0.85, t);

            _color.copy(DARK_WARM);
            _color.lerp(DARK_COLD, voidToFracture * (1 - fractureToInsight));
            _color.lerp(DARK_WARM, fractureToInsight * (1 - insightToSolution) * 0.5);
            _color.lerp(DARK_STUDIO, insightToSolution);
            fog.color.copy(_color);

            fog.near = THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(15, 8, voidToFracture),
                THREE.MathUtils.lerp(10, 5, insightToSolution),
                fractureToInsight
            );
            fog.far = THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(55, 35, voidToFracture),
                THREE.MathUtils.lerp(50, 70, solutionToLate),
                insightToSolution
            );
        }
    });

    return (
        <group>
            {/* Primary glows */}
            <mesh ref={warmGlowRef} position={[14, 10, -45]}>
                <sphereGeometry args={[20, 32, 32]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0.07} side={THREE.BackSide} />
            </mesh>
            <mesh ref={coldGlowRef} position={[-10, -5, -35]}>
                <sphereGeometry args={[25, 32, 32]} />
                <meshBasicMaterial color="#4A6FA5" transparent opacity={0} side={THREE.BackSide} />
            </mesh>
            <mesh ref={studioGlowRef} position={[0, 15, -30]}>
                <sphereGeometry args={[20, 24, 24]} />
                <meshBasicMaterial color="#E8DDD0" transparent opacity={0} side={THREE.BackSide} />
            </mesh>

            {/* Deep nebula — far background, barely moves (strong depth cue) */}
            <mesh ref={deepNebulaRef} position={[-20, 5, -80]}>
                <sphereGeometry args={[35, 16, 16]} />
                <meshBasicMaterial color="#2A1A3A" transparent opacity={0.04} side={THREE.BackSide} />
            </mesh>

            {/* Mid atmospheric haze — between midground and background */}
            <mesh ref={midHazeRef} position={[8, -3, -50]}>
                <sphereGeometry args={[18, 16, 16]} />
                <meshBasicMaterial color="#4A6FA5" transparent opacity={0} side={THREE.BackSide} />
            </mesh>

            {/* Near veil — foreground atmosphere, parallax-visible */}
            <mesh ref={nearVeilRef} position={[0, 2, -15]}>
                <sphereGeometry args={[12, 12, 12]} />
                <meshBasicMaterial color="#6B4C9A" transparent opacity={0} side={THREE.BackSide} />
            </mesh>
        </group>
    );
}

// ═══════════════════════════════════════════════
//  MIDGROUND: Dust → Shards → Architecture
// ═══════════════════════════════════════════════
function DustToArchitecture({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const dustRef = useRef<THREE.InstancedMesh>(null);
    const shardRef = useRef<THREE.InstancedMesh>(null);
    const shardWireRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const dustData = useMemo(() => {
        const d = {
            positions: new Float32Array(DUST_COUNT * 3),
            sizes: new Float32Array(DUST_COUNT),
            driftSpeeds: new Float32Array(DUST_COUNT * 3),
            phases: new Float32Array(DUST_COUNT),
        };
        for (let i = 0; i < DUST_COUNT; i++) {
            const i3 = i * 3;
            d.positions[i3] = (Math.random() - 0.5) * 50;
            d.positions[i3 + 1] = (Math.random() - 0.5) * 30;
            d.positions[i3 + 2] = -8 - Math.random() * 40;
            d.sizes[i] = 0.015 + Math.random() * 0.04;
            d.driftSpeeds[i3] = (Math.random() - 0.5) * 0.08;
            d.driftSpeeds[i3 + 1] = (Math.random() - 0.5) * 0.04;
            d.driftSpeeds[i3 + 2] = (Math.random() - 0.5) * 0.02;
            d.phases[i] = Math.random() * Math.PI * 2;
        }
        return d;
    }, []);

    // Shards: scattered positions (fracture) → locked positions (production)
    const shardData = useMemo(() => {
        const s = [];
        for (let i = 0; i < SHARD_COUNT; i++) {
            // Fracture position: chaotic, scattered
            const fracturePos = new THREE.Vector3(
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 20,
                -15 - Math.random() * 25
            );

            // Production position: orderly, architectural — walls/panels
            const section = i % 4;
            let prodPos: THREE.Vector3;
            if (section === 0) {
                // Left wall
                prodPos = new THREE.Vector3(-12 - Math.random() * 2, -2 + Math.random() * 10, -20 - Math.random() * 15);
            } else if (section === 1) {
                // Right wall
                prodPos = new THREE.Vector3(12 + Math.random() * 2, -2 + Math.random() * 10, -20 - Math.random() * 15);
            } else if (section === 2) {
                // Back wall
                prodPos = new THREE.Vector3((Math.random() - 0.5) * 20, -2 + Math.random() * 10, -35 - Math.random() * 5);
            } else {
                // Ceiling panels
                prodPos = new THREE.Vector3((Math.random() - 0.5) * 16, 9 + Math.random() * 3, -22 - Math.random() * 12);
            }

            s.push({
                fracturePos,
                prodPos,
                scale: 0.4 + Math.random() * 1.8,
                prodScale: 1.2 + Math.random() * 2.5,
                rotSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.2
                ),
                // Production: fixed rotation (locked panel)
                prodRot: new THREE.Euler(
                    section === 0 ? 0 : section === 1 ? 0 : section === 2 ? 0 : Math.PI / 2,
                    section === 0 ? Math.PI / 2 : section === 1 ? -Math.PI / 2 : 0,
                    0
                ),
                wobblePhase: Math.random() * Math.PI * 2,
                wobbleAmp: 0.3 + Math.random() * 0.5,
            });
        }
        return s;
    }, []);

    useFrame(({ clock }) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;

        // Phase boundaries
        const fractureStart = 0.15;
        const fractureEnd = 0.30;
        const productionStart = 0.42;
        const productionEnd = 0.60;

        // ── DUST ──
        if (dustRef.current) {
            const dustOpacity = Math.max(0, 1 - t * 3) * 0.55;
            const dustMat = dustRef.current.material as THREE.MeshStandardMaterial;
            dustMat.opacity = dustOpacity;
            _color.lerpColors(AMBER, COLD_BLUE, Math.min(t * 2.5, 1));
            dustMat.color.copy(_color);
            dustMat.emissive.copy(_color);

            const driftScale = Math.max(0, 1 - t * 2);
            for (let i = 0; i < DUST_COUNT; i++) {
                const i3 = i * 3;
                const phase = dustData.phases[i];
                dummy.position.set(
                    dustData.positions[i3] + Math.sin(time * dustData.driftSpeeds[i3] + phase) * 1.5 * driftScale,
                    dustData.positions[i3 + 1] + Math.cos(time * dustData.driftSpeeds[i3 + 1] + phase) * 0.8 * driftScale + time * 0.015,
                    dustData.positions[i3 + 2]
                );
                dummy.scale.setScalar(dustData.sizes[i]);
                dummy.updateMatrix();
                dustRef.current.setMatrixAt(i, dummy.matrix);
            }
            dustRef.current.instanceMatrix.needsUpdate = true;
        }

        // ── SHARDS → ARCHITECTURE ──
        if (shardRef.current && shardWireRef.current) {
            const shardVisibility = THREE.MathUtils.smoothstep(t, fractureStart, fractureEnd);
            const assemblyProgress = THREE.MathUtils.smoothstep(t, productionStart, productionEnd);

            const shardMat = shardRef.current.material as THREE.MeshStandardMaterial;
            const wireMat = shardWireRef.current.material as THREE.MeshBasicMaterial;

            // In production: surfaces become more opaque, wireframes dim
            shardMat.opacity = shardVisibility * THREE.MathUtils.lerp(0.5, 0.75, assemblyProgress);
            wireMat.opacity = shardVisibility * THREE.MathUtils.lerp(0.25, 0.08, assemblyProgress);

            // Color shifts: cold blue wireframe → subtle green (production tool color)
            _color.lerpColors(COLD_BLUE, STAGE_GREEN, assemblyProgress * 0.6);
            wireMat.color.copy(_color);

            // Surface becomes warmer in production
            _color.lerpColors(new THREE.Color('#1A1A2E'), new THREE.Color('#1A1A1A'), assemblyProgress);
            shardMat.color.copy(_color);
            shardMat.metalness = THREE.MathUtils.lerp(0.35, 0.15, assemblyProgress);

            for (let i = 0; i < SHARD_COUNT; i++) {
                const shard = shardData[i];

                // Position lerp: fracture chaos → production architecture
                dummy.position.lerpVectors(shard.fracturePos, shard.prodPos, assemblyProgress);

                // Wobble decays to zero in production (stability)
                const wobbleDecay = 1 - assemblyProgress;
                dummy.position.x += Math.sin(time * 0.5 + shard.wobblePhase) * shard.wobbleAmp * wobbleDecay;
                dummy.position.y += Math.cos(time * 0.4 + shard.wobblePhase * 1.3) * shard.wobbleAmp * 0.6 * wobbleDecay;

                // Glitch displacement during fracture — periodic sharp offsets
                const glitchIntensity = shardVisibility * (1 - assemblyProgress);
                if (glitchIntensity > 0.1 && Math.sin(time * 8 + i * 3.7) > 0.92) {
                    dummy.position.x += (Math.random() - 0.5) * 1.5 * glitchIntensity;
                    dummy.position.y += (Math.random() - 0.5) * 0.8 * glitchIntensity;
                }

                // Rotation: tumble → locked panel orientation
                dummy.rotation.set(
                    THREE.MathUtils.lerp(time * shard.rotSpeed.x, shard.prodRot.x, assemblyProgress),
                    THREE.MathUtils.lerp(time * shard.rotSpeed.y, shard.prodRot.y, assemblyProgress),
                    THREE.MathUtils.lerp(time * shard.rotSpeed.z, shard.prodRot.z, assemblyProgress),
                );

                // Scale: small shards → large panels
                const s = THREE.MathUtils.lerp(shard.scale, shard.prodScale, assemblyProgress) * shardVisibility;
                dummy.scale.set(
                    s,
                    s * THREE.MathUtils.lerp(1.6, 1.2, assemblyProgress),
                    s * THREE.MathUtils.lerp(0.06, 0.03, assemblyProgress)
                );
                dummy.updateMatrix();

                shardRef.current.setMatrixAt(i, dummy.matrix);
                shardWireRef.current.setMatrixAt(i, dummy.matrix);
            }
            shardRef.current.instanceMatrix.needsUpdate = true;
            shardWireRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group>
            <instancedMesh ref={dustRef} args={[undefined, undefined, DUST_COUNT]} frustumCulled={false}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshStandardMaterial color="#D4A04A" emissive="#D4A04A" emissiveIntensity={1.2} transparent opacity={0.55} roughness={1} />
            </instancedMesh>
            <instancedMesh ref={shardRef} args={[undefined, undefined, SHARD_COUNT]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#1A1A2E" emissive="#2A3A5A" emissiveIntensity={0.15} metalness={0.6} roughness={0.1} transparent opacity={0} envMapIntensity={0.8} />
            </instancedMesh>
            <instancedMesh ref={shardWireRef} args={[undefined, undefined, SHARD_COUNT]} frustumCulled={false}>
                <boxGeometry args={[1.02, 1.02, 1.02]} />
                <meshBasicMaterial color="#4A6FA5" wireframe transparent opacity={0} />
            </instancedMesh>
        </group>
    );
}

// ═══════════════════════════════════════════════
//  PRODUCTION: Floor Grid (Persistent Ground Plane)
// ═══════════════════════════════════════════════
function ProductionFloor({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);

    const gridLines = useMemo(() => {
        const lines: { start: THREE.Vector3; end: THREE.Vector3; axis: 'x' | 'z' }[] = [];
        const halfSize = 20;
        const spacing = 2;

        // Z-axis lines (into scene)
        for (let x = -halfSize; x <= halfSize; x += spacing) {
            lines.push({
                start: new THREE.Vector3(x, -4, -5),
                end: new THREE.Vector3(x, -4, -45),
                axis: 'z',
            });
        }

        // X-axis lines (across scene)
        for (let z = -5; z >= -45; z -= spacing) {
            lines.push({
                start: new THREE.Vector3(-halfSize, -4, z),
                end: new THREE.Vector3(halfSize, -4, z),
                axis: 'x',
            });
        }

        return lines;
    }, []);

    useFrame(() => {
        if (!groupRef.current) return;
        const t = scrollRef.current;
        const visibility = THREE.MathUtils.smoothstep(t, 0.42, 0.55) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 0.92));

        groupRef.current.children.forEach((child) => {
            const line = child as THREE.Line;
            const mat = line.material as THREE.LineBasicMaterial;
            mat.opacity = visibility * 0.15;
        });
    });

    return (
        <group ref={groupRef}>
            {gridLines.map((line, i) => {
                const points = [line.start, line.end];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                return (
                    // @ts-ignore — R3F line element, not SVG
                    <line key={i} geometry={geometry}>
                        {/* @ts-ignore - R3F line material */}
                        <lineBasicMaterial color="#2A8F6A" transparent opacity={0} />
                    </line>
                );
            })}
        </group>
    );
}

// ═══════════════════════════════════════════════
//  PRODUCTION: Camera Path (Spline visualized in space)
// ═══════════════════════════════════════════════
function CameraPath({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const lineRef = useRef<THREE.Line>(null);
    const dotRef = useRef<THREE.Mesh>(null);

    // A smooth camera path spline through the production space
    const curve = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-8, 0, -10),
            new THREE.Vector3(-4, 1, -18),
            new THREE.Vector3(2, 2, -24),
            new THREE.Vector3(6, 0.5, -30),
            new THREE.Vector3(3, -1, -35),
        ]);
    }, []);

    const pathGeometry = useMemo(() => {
        const points = curve.getPoints(80);
        return new THREE.BufferGeometry().setFromPoints(points);
    }, [curve]);

    useFrame(({ clock }) => {
        const t = scrollRef.current;
        const visibility = THREE.MathUtils.smoothstep(t, 0.45, 0.55) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 0.92));
        const time = clock.elapsedTime;

        if (lineRef.current) {
            const mat = lineRef.current.material as THREE.LineBasicMaterial;
            mat.opacity = visibility * 0.4;
        }

        // Moving dot along the path — shows "active camera"
        if (dotRef.current) {
            const pathProgress = ((time * 0.05) % 1);
            const pos = curve.getPoint(pathProgress);
            dotRef.current.position.copy(pos);

            const mat = dotRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = visibility * 0.9;
        }
    });

    return (
        <group>
            {/* Camera path line */}
            {/* @ts-ignore — R3F line element */}
            <line ref={lineRef} geometry={pathGeometry}>
                {/* @ts-ignore */}
                <lineBasicMaterial color="#D4A04A" transparent opacity={0} linewidth={1} />
            </line>

            {/* Active camera dot — traveling along path */}
            <mesh ref={dotRef}>
                <sphereGeometry args={[0.15, 8, 8]} />
                <meshBasicMaterial color="#D4A04A" transparent opacity={0} />
            </mesh>
        </group>
    );
}

// ═══════════════════════════════════════════════
//  PRODUCTION: Figure Silhouettes (Character Placeholders)
// ═══════════════════════════════════════════════
function Figures({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);

    const figureData = useMemo(() => {
        return [
            { pos: new THREE.Vector3(-6, -2, -20), scale: 1.0 },
            { pos: new THREE.Vector3(-2, -2, -26), scale: 0.95 },
            { pos: new THREE.Vector3(4, -2, -22), scale: 1.05 },
            { pos: new THREE.Vector3(8, -2, -28), scale: 0.9 },
            { pos: new THREE.Vector3(0, -2, -32), scale: 1.0 },
        ];
    }, []);

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const visibility = THREE.MathUtils.smoothstep(t, 0.48, 0.58) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 0.92));

        groupRef.current.children.forEach((child, i) => {
            // Subtle sway animation per figure
            child.rotation.z = Math.sin(time * 0.3 + i * 1.7) * 0.03 * visibility;
            child.rotation.x = Math.cos(time * 0.2 + i * 2.3) * 0.015 * visibility;

            child.children.forEach((mesh) => {
                const m = mesh as THREE.Mesh;
                const mat = m.material as THREE.MeshStandardMaterial;
                mat.opacity = visibility * 0.5;
            });
        });
    });

    return (
        <group ref={groupRef}>
            {figureData.map((fig, i) => (
                <group key={i} position={fig.pos} scale={fig.scale}>
                    {/* Body — simple capsule silhouette */}
                    <mesh position={[0, 1.2, 0]}>
                        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
                        <meshStandardMaterial
                            color="#1A1A1A"
                            emissive="#2A8F6A"
                            emissiveIntensity={0.15}
                            transparent
                            opacity={0}
                        />
                    </mesh>
                    {/* Head */}
                    <mesh position={[0, 2.2, 0]}>
                        <sphereGeometry args={[0.25, 8, 8]} />
                        <meshStandardMaterial
                            color="#1A1A1A"
                            emissive="#2A8F6A"
                            emissiveIntensity={0.15}
                            transparent
                            opacity={0}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

// ═══════════════════════════════════════════════
//  PRODUCTION: Stage Boundaries (Wireframe Room Outline)
// ═══════════════════════════════════════════════
function StageBounds({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);

    // Define the outline of the "stage volume" — a rectangular room
    const edgeGeometry = useMemo(() => {
        const w = 26, h = 14, d = 35;
        const hw = w / 2, hh = h / 2;
        const zStart = -8, zEnd = zStart - d;
        const yBottom = -4;

        const edges = [
            // Bottom rectangle
            [[-hw, yBottom, zStart], [hw, yBottom, zStart]],
            [[hw, yBottom, zStart], [hw, yBottom, zEnd]],
            [[hw, yBottom, zEnd], [-hw, yBottom, zEnd]],
            [[-hw, yBottom, zEnd], [-hw, yBottom, zStart]],
            // Top rectangle
            [[-hw, yBottom + h, zStart], [hw, yBottom + h, zStart]],
            [[hw, yBottom + h, zStart], [hw, yBottom + h, zEnd]],
            [[hw, yBottom + h, zEnd], [-hw, yBottom + h, zEnd]],
            [[-hw, yBottom + h, zEnd], [-hw, yBottom + h, zStart]],
            // Vertical edges
            [[-hw, yBottom, zStart], [-hw, yBottom + h, zStart]],
            [[hw, yBottom, zStart], [hw, yBottom + h, zStart]],
            [[hw, yBottom, zEnd], [hw, yBottom + h, zEnd]],
            [[-hw, yBottom, zEnd], [-hw, yBottom + h, zEnd]],
        ];

        return edges.map(([start, end]) => {
            return new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...(start as [number, number, number])),
                new THREE.Vector3(...(end as [number, number, number])),
            ]);
        });
    }, []);

    useFrame(() => {
        if (!groupRef.current) return;
        const t = scrollRef.current;
        const visibility = THREE.MathUtils.smoothstep(t, 0.42, 0.55) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 0.92));

        groupRef.current.children.forEach((child) => {
            const line = child as THREE.Line;
            const mat = line.material as THREE.LineBasicMaterial;
            mat.opacity = visibility * 0.12;
        });
    });

    return (
        <group ref={groupRef}>
            {edgeGeometry.map((geo, i) => (
                // @ts-ignore — R3F line element
                <line key={i} geometry={geo}>
                    {/* @ts-ignore */}
                    <lineBasicMaterial color="#E8DDD0" transparent opacity={0} />
                </line>
            ))}
            {/* Corner accent lights — small emissive spheres at bottom corners */}
            {[
                [-13, -4, -8], [13, -4, -8], [-13, -4, -43], [13, -4, -43]
            ].map((pos, i) => (
                <mesh key={`accent-${i}`} position={pos as [number, number, number]}>
                    <sphereGeometry args={[0.12, 6, 6]} />
                    <meshBasicMaterial color="#D4A04A" transparent opacity={0} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
}

// ═══════════════════════════════════════════════
//  FOREGROUND: Bokeh (Color-Adaptive, Depth-Layered)
// ═══════════════════════════════════════════════
function BokehOrbs({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const groupRef = useRef<THREE.Group>(null);

    const orbs = useMemo(() => {
        const data = [];
        for (let i = 0; i < BOKEH_COUNT; i++) {
            // Three depth bands: near (z 4-8), mid (z 8-12), far (z 12-16)
            const depthBand = i % 3; // 0=near, 1=mid, 2=far
            const zBase = depthBand === 0 ? 4 : depthBand === 1 ? 8 : 12;
            const zRange = 4;

            data.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 25,
                    zBase + Math.random() * zRange,
                ),
                size: depthBand === 0 ? 0.08 + Math.random() * 0.12 : depthBand === 1 ? 0.04 + Math.random() * 0.08 : 0.02 + Math.random() * 0.04,
                speed: 0.05 + Math.random() * 0.12,
                phase: Math.random() * Math.PI * 2,
                baseOpacity: depthBand === 0 ? 0.025 + Math.random() * 0.03 : depthBand === 1 ? 0.015 + Math.random() * 0.02 : 0.008 + Math.random() * 0.012,
                parallaxFactor: depthBand === 0 ? 1.6 : depthBand === 1 ? 1.0 : 0.4, // near moves more
                pulseSpeed: 0.3 + Math.random() * 0.6,
            });
        }
        return data;
    }, []);

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const time = clock.elapsedTime;
        const t = scrollRef.current;

        const coldBlend = smootherstep(0.08, 0.40, t);
        const warmBlend = smootherstep(0.45, 0.85, t);

        groupRef.current.children.forEach((child, i) => {
            const orb = orbs[i];
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;

            // Parallax: near orbs drift more, far orbs drift less
            const pf = orb.parallaxFactor;
            mesh.position.x = orb.position.x + Math.sin(time * orb.speed + orb.phase) * 2 * pf;
            mesh.position.y = orb.position.y + Math.cos(time * orb.speed * 0.7 + orb.phase) * 1 * pf;

            // Size pulse — subtle breathing
            const sizePulse = 1 + Math.sin(time * orb.pulseSpeed + orb.phase) * 0.15;
            mesh.scale.setScalar(sizePulse);

            // Color: amber → cold blue → warm white
            _color.copy(AMBER);
            _color.lerp(COLD_BLUE, coldBlend);
            _color.lerp(WARM_WHITE, warmBlend);
            mat.color.copy(_color);
            mat.opacity = orb.baseOpacity * (Math.sin(time * 0.5 + orb.phase) * 0.3 + 0.7);
        });
    });

    return (
        <group ref={groupRef}>
            {orbs.map((orb, i) => (
                <mesh key={i} position={orb.position}>
                    <circleGeometry args={[orb.size, 16]} />
                    <meshBasicMaterial color="#D4A04A" transparent opacity={orb.baseOpacity} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
}

// ═══════════════════════════════════════════════
//  LIGHTING: Six-Phase Cinematic Adaptive
// ═══════════════════════════════════════════════
function AdaptiveLighting({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const keyLightRef = useRef<THREE.DirectionalLight>(null);
    const coldLight1Ref = useRef<THREE.PointLight>(null);
    const coldLight2Ref = useRef<THREE.PointLight>(null);
    const insightWarm1Ref = useRef<THREE.PointLight>(null);
    const insightWarm2Ref = useRef<THREE.PointLight>(null);
    const studioKeyRef = useRef<THREE.SpotLight>(null);
    const studioFillRef = useRef<THREE.PointLight>(null);
    const studioRimRef = useRef<THREE.PointLight>(null);
    const closingLightRef = useRef<THREE.PointLight>(null);
    const rigGroupRef = useRef<THREE.Group>(null);

    useFrame(({ clock }, delta) => {
        const t = scrollRef.current;
        const time = clock.elapsedTime;
        const lerpRate = 1 - Math.exp(-4 * delta);

        // Phase 1: Amber key light — cinematic darkness
        if (keyLightRef.current) {
            const amberTarget = (1 - smootherstep(0.0, 0.35, t)) * 0.45;
            keyLightRef.current.intensity += (amberTarget - keyLightRef.current.intensity) * lerpRate;
        }

        // Phase 2: Cold lights — fracture phase with subtle flicker
        const coldBase = smootherstep(0.12, 0.25, t) * (1 - smootherstep(0.30, 0.45, t)) * 0.6;
        const flicker = 1 + Math.sin(time * 12) * 0.05 + Math.sin(time * 23) * 0.03;
        const coldTarget = coldBase * flicker;
        if (coldLight1Ref.current) coldLight1Ref.current.intensity += (coldTarget - coldLight1Ref.current.intensity) * lerpRate;
        if (coldLight2Ref.current) coldLight2Ref.current.intensity += (coldTarget * 0.7 - coldLight2Ref.current.intensity) * lerpRate;

        // Phase 3: Insight — dawn golden warmth
        const insightTarget = smootherstep(0.28, 0.38, t) * (1 - smootherstep(0.43, 0.52, t));
        if (insightWarm1Ref.current) insightWarm1Ref.current.intensity += (insightTarget * 0.7 - insightWarm1Ref.current.intensity) * lerpRate;
        if (insightWarm2Ref.current) insightWarm2Ref.current.intensity += (insightTarget * 0.4 - insightWarm2Ref.current.intensity) * lerpRate;

        // Phase 4+5: Studio lights — production & proof
        const studioTarget = smootherstep(0.45, 0.55, t) * (1 - smootherstep(0.82, 0.95, t));
        if (studioKeyRef.current) studioKeyRef.current.intensity += (studioTarget * 1.2 - studioKeyRef.current.intensity) * lerpRate;
        if (studioFillRef.current) studioFillRef.current.intensity += (studioTarget * 0.35 - studioFillRef.current.intensity) * lerpRate;
        if (studioRimRef.current) studioRimRef.current.intensity += (studioTarget * 0.25 - studioRimRef.current.intensity) * lerpRate;

        // Visible light rigs — fade with studio phase
        if (rigGroupRef.current) {
            rigGroupRef.current.children.forEach((child) => {
                if ((child as THREE.Mesh).material) {
                    const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                    if (mat.opacity !== undefined) {
                        mat.opacity += (studioTarget * 0.6 - mat.opacity) * lerpRate;
                    }
                }
            });
        }

        // Phase 6: Closing — single warm light, breathing
        if (closingLightRef.current) {
            const closingTarget = smootherstep(0.85, 0.92, t) * 0.4 * (0.9 + Math.sin(time * 0.3) * 0.1);
            closingLightRef.current.intensity += (closingTarget - closingLightRef.current.intensity) * lerpRate;
        }
    });

    return (
        <>
            {/* Void: warm amber key — upper right, cinematic */}
            <directionalLight ref={keyLightRef} position={[18, 12, 8]} intensity={0.45} color="#D4A04A" />
            <ambientLight intensity={0.006} color="#08080F" />

            {/* Fracture: cold scattered — conflicting hues */}
            <pointLight ref={coldLight1Ref} position={[-12, 6, -15]} intensity={0} color="#B8C4E0" distance={35} />
            <pointLight ref={coldLight2Ref} position={[8, -5, -25]} intensity={0} color="#6B4C9A" distance={30} />

            {/* Insight: dawn warm fills — low angle for golden hour feel */}
            <pointLight ref={insightWarm1Ref} position={[20, 3, -18]} intensity={0} color="#E8B84A" distance={45} />
            <pointLight ref={insightWarm2Ref} position={[-15, 1, -25]} intensity={0} color="#D4A04A" distance={35} />

            {/* Edge volumetrics — subtle persistent depth spill */}
            <pointLight position={[-25, -2, -40]} intensity={0.04} color="#2A1A3A" distance={50} />
            <pointLight position={[22, 8, -55]} intensity={0.03} color="#1A2A3A" distance={45} />

            {/* Production: controlled studio three-point */}
            <spotLight
                ref={studioKeyRef}
                position={[0, 14, -20]}
                angle={0.6}
                penumbra={0.8}
                intensity={0}
                color="#E8DDD0"
                distance={45}
                target-position={[0, -4, -25]}
            />
            <pointLight ref={studioFillRef} position={[-10, 3, -18]} intensity={0} color="#C4B5A0" distance={25} />
            <pointLight ref={studioRimRef} position={[12, 6, -30]} intensity={0} color="#D4A04A" distance={20} />

            {/* Visible light rig geometry — C-stands & fresnels */}
            <group ref={rigGroupRef}>
                {/* Left C-stand */}
                <mesh position={[-10, -1, -16]}>
                    <cylinderGeometry args={[0.04, 0.06, 8, 6]} />
                    <meshStandardMaterial color="#1A1A1A" metalness={0.8} roughness={0.3} transparent opacity={0} />
                </mesh>
                {/* Left fresnel head */}
                <mesh position={[-10, 3, -16]} rotation={[0.3, 0.5, 0]}>
                    <cylinderGeometry args={[0.15, 0.4, 0.6, 8]} />
                    <meshStandardMaterial color="#222222" emissive="#C4B5A0" emissiveIntensity={0.3} metalness={0.7} roughness={0.2} transparent opacity={0} />
                </mesh>
                {/* Right C-stand */}
                <mesh position={[12, -1, -28]}>
                    <cylinderGeometry args={[0.04, 0.06, 8, 6]} />
                    <meshStandardMaterial color="#1A1A1A" metalness={0.8} roughness={0.3} transparent opacity={0} />
                </mesh>
                {/* Right rim light head */}
                <mesh position={[12, 3, -28]} rotation={[-0.2, -0.4, 0]}>
                    <cylinderGeometry args={[0.15, 0.4, 0.6, 8]} />
                    <meshStandardMaterial color="#222222" emissive="#D4A04A" emissiveIntensity={0.4} metalness={0.7} roughness={0.2} transparent opacity={0} />
                </mesh>
                {/* Overhead key stand */}
                <mesh position={[0, 7, -20]}>
                    <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
                    <meshStandardMaterial color="#1A1A1A" metalness={0.8} roughness={0.3} transparent opacity={0} />
                </mesh>
            </group>

            {/* Closing: single warm presence */}
            <pointLight ref={closingLightRef} position={[0, 2, -40]} intensity={0} color="#D4A04A" distance={40} decay={2} />
        </>
    );
}

// ═══════════════════════════════════════════════
//  CAMERA: Cinematic Spline Dolly
// ═══════════════════════════════════════════════
function CameraController({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
    const startTime = useRef<number | null>(null);
    const loadComplete = useRef(false);
    const prevT = useRef(0);

    const loadStart = useMemo(() => new THREE.Vector3(0, 0.5, 26), []);
    const loadEnd = useMemo(() => new THREE.Vector3(0, 0, 20), []);

    // CatmullRom spline through all waypoints — smooth dolly path
    const positionSpline = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 20),         // Hook (Void)
        new THREE.Vector3(4, -1, 6),         // Problem (Fracture)
        new THREE.Vector3(1, 2, -4),         // Insight (Dawn convergence)
        new THREE.Vector3(2, 4, -12),        // Solution (Production)
        new THREE.Vector3(0, 10, -30),       // Proof (World reuse, high overview)
        new THREE.Vector3(0, 1, -40),        // CTA (Closing)
    ], false, 'catmullrom', 0.3), []);

    const lookSpline = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),          // Hook: straight ahead
        new THREE.Vector3(-2, -2, -15),      // Problem: into the chaos
        new THREE.Vector3(0, 0, -20),        // Insight: into converging particles
        new THREE.Vector3(0, -2, -25),       // Solution: down into the stage
        new THREE.Vector3(0, -3, -42),       // Proof: terrain overview
        new THREE.Vector3(0, 0, -50),        // CTA: straight ahead, still
    ], false, 'catmullrom', 0.3), []);

    useFrame(({ clock, camera }, delta) => {
        if (startTime.current === null) {
            startTime.current = clock.elapsedTime;
            camera.position.copy(loadStart);
            _lookSmooth.set(0, 0, 0);
        }

        const elapsed = clock.elapsedTime - startTime.current;
        const t = scrollRef.current;
        // Heavier damping for cinematic weight
        const posLerp = 1 - Math.exp(-2.5 * delta);
        const lookLerp = 1 - Math.exp(-3.0 * delta);

        // Phase 0: Load push-in (quintic ease-out)
        if (!loadComplete.current && t < 0.02) {
            const pushDuration = 5;
            const pushProgress = Math.min(elapsed / pushDuration, 1);
            const p = 1 - pushProgress;
            const eased = 1 - p * p * p * p * p;
            _vec3.lerpVectors(loadStart, loadEnd, eased);
            camera.position.lerp(_vec3, posLerp);
            if (pushProgress >= 1) loadComplete.current = true;

            if (pushProgress >= 0.8) {
                const driftT = elapsed - pushDuration * 0.8;
                camera.position.x += Math.sin(driftT * 0.08) * 0.1;
                camera.position.y += Math.cos(driftT * 0.06) * 0.06;
            }
        } else {
            loadComplete.current = true;

            // Sample spline at scroll position — smooth continuous path
            const splineT = Math.max(0, Math.min(1, t));
            positionSpline.getPoint(splineT, _vec3);

            // Drift: organic breathing that decelerates toward closing
            const driftDecay = 1 - smootherstep(0.5, 0.95, t) * 0.95;
            _vec3.x += Math.sin(clock.elapsedTime * 0.06) * 0.08 * driftDecay;
            _vec3.y += Math.cos(clock.elapsedTime * 0.05) * 0.05 * driftDecay;

            // Damped position follow — cinematic weight
            camera.position.lerp(_vec3, posLerp);

            // Smooth lookAt from spline — no per-frame allocation
            lookSpline.getPoint(splineT, _lookTarget);
            _lookSmooth.lerp(_lookTarget, lookLerp);
            camera.lookAt(_lookSmooth);

            // Subtle camera roll during movement — builds and decays
            const scrollVelocity = Math.abs(t - prevT.current) / Math.max(delta, 0.001);
            const rollAmount = Math.min(scrollVelocity * 0.015, 0.02) * Math.sign(t - prevT.current);
            camera.rotation.z += (rollAmount - camera.rotation.z) * (1 - Math.exp(-2 * delta));
        }

        prevT.current = t;
    });

    return null;
}

// ═══════════════════════════════════════════════
//  MAIN EXPORT
// ═══════════════════════════════════════════════
export function CinematicScene() {
    const scroll = useScroll();
    const scrollRef = useRef(0);

    useFrame(() => {
        scrollRef.current = scroll.offset;
    });

    return (
        <>
            <fog attach="fog" args={['#0a0806', 12, 80]} />

            {/* Shared layers (all phases) */}
            <AtmosphericBackground scrollRef={scrollRef} />
            <DustToArchitecture scrollRef={scrollRef} />
            <BokehOrbs scrollRef={scrollRef} />
            <AdaptiveLighting scrollRef={scrollRef} />
            <CameraController scrollRef={scrollRef} />

            {/* Production elements (Solution phase) */}
            <ProductionFloor scrollRef={scrollRef} />
            <CameraPath scrollRef={scrollRef} />
            <Figures scrollRef={scrollRef} />
            <StageBounds scrollRef={scrollRef} />

            {/* Phase-specific worlds */}
            <InsightWorld scrollRef={scrollRef} />
            <ProductionDemo scrollRef={scrollRef} />
            <ClosingWorld scrollRef={scrollRef} />
        </>
    );
}
