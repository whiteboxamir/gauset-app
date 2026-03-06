"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, TransformControls } from "@react-three/drei";
import { LumaSplatsThree } from "@lumaai/luma-web";
import * as THREE from "three";
import { EffectComposer, Bloom, DepthOfField, Noise, Vignette, ChromaticAberration, Scanline } from "@react-three/postprocessing";
import type { AssetType, LightingPreset, SceneAsset } from "@/components/Viewfinder/AssetOrchestrator";
import { AnnotationSystem, Annotation } from "@/components/Viewfinder/AnnotationSystem";
import { AgentDirector } from "@/components/Viewfinder/AgentDirector";

interface SceneViewerProps {
    isRecording: boolean;
    assets: SceneAsset[];
    lighting: LightingPreset;
    shaderPreset?: string;
    isPlacingAnnotation?: boolean;
    onAnnotationAdded?: (ann: Annotation) => void;
    annotations?: Annotation[];
    agentTargetPosition?: number[] | null;
    selectedAssetId?: string | null;
    onAssetSelect?: (id: string | null) => void;
    onAssetTransform?: (id: string, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void;
}

// Loads a standard GLB static mesh layout
function GLBViewer({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
}

// A component that wraps the Luma WebGL viewer
function SplatViewer({ splatUrl }: { splatUrl: string }) {
    // Crucial Fix: NEVER instantiate LumaSplatsThree directly in the JSX object prop
    // as it triggers WebGL context exhaustion on every re-render (which happens when recording/typing).
    const [splat] = useState(() => new LumaSplatsThree({ source: splatUrl }));

    useEffect(() => {
        return () => {
            splat.dispose(); // clean up memory cleanly when unmounting
        };
    }, [splat]);

    return (
        <primitive
            object={splat}
            position={[0, 0, 0]}
        />
    );
}

// We will implement DeviceOrientationControls for the camera here
function CameraController({ isRecording, isActive }: { isRecording: boolean, isActive: boolean }) {
    const { camera } = useThree();
    const recordedPathRef = useRef<{ time: number; position: number[]; rotation: number[] }[]>([]);
    const orientationDataRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

    useEffect(() => {
        // This will handle gyro movement
        if (typeof window !== "undefined" && window.DeviceOrientationEvent && isActive) {
            const handleOrientation = (event: DeviceOrientationEvent) => {
                if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
                    orientationDataRef.current = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
                }
            };

            // Request permission on iOS 13+
            const requestAccess = async () => {
                if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                    try {
                        const permission = await (DeviceOrientationEvent as any).requestPermission();
                        if (permission === 'granted') {
                            window.addEventListener("deviceorientation", handleOrientation);
                        }
                    } catch (e) {
                        console.error("Device orientation error", e);
                    }
                } else {
                    window.addEventListener("deviceorientation", handleOrientation);
                }
            };

            requestAccess();
            return () => {
                window.removeEventListener("deviceorientation", handleOrientation);
            };
        }
    }, [isActive]);

    useFrame((state, delta) => {
        // Apply orientation
        const data = orientationDataRef.current;
        if (data && isActive) {
            // Convert degrees to radians and map to camera rotation
            const alpha = THREE.MathUtils.degToRad(data.alpha);
            const beta = THREE.MathUtils.degToRad(data.beta);
            const gamma = THREE.MathUtils.degToRad(data.gamma);

            const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
            camera.quaternion.setFromEuler(euler);
        }

        // Handle recording
        if (isRecording) {
            recordedPathRef.current.push({
                time: state.clock.elapsedTime,
                position: [camera.position.x, camera.position.y, camera.position.z],
                rotation: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]
            });
        }

        // If recording just stopped, log out the recorded path
        if (!isRecording && recordedPathRef.current.length > 0) {
            console.log("Recorded Path Length:", recordedPathRef.current.length);

            // Dispatch an event so the parent container can grab the payload
            const event = new CustomEvent("gauset-recording-complete", {
                detail: { path: recordedPathRef.current }
            });
            window.dispatchEvent(event);

            // Reset after sending
            recordedPathRef.current = [];
        }
    });

    return null;
}

export default function SceneViewer({
    isRecording,
    assets,
    lighting,
    shaderPreset = "natural",
    isPlacingAnnotation = false,
    onAnnotationAdded,
    annotations = [],
    agentTargetPosition = null,
    selectedAssetId = null,
    onAssetSelect,
    onAssetTransform
}: SceneViewerProps) {

    const handlePointerMissed = () => {
        if (!isPlacingAnnotation && onAssetSelect) {
            onAssetSelect(null);
        }
    };

    return (
        <div className="w-full h-full absolute inset-0 bg-black">
            <Canvas
                shadows
                camera={{ position: [0, 1.5, 3], fov: 75 }}
                gl={{ antialias: true }}
                dpr={[1, 2]} // Optimize for mobile retina displays
                onPointerMissed={handlePointerMissed}
            >
                <Suspense fallback={null}>
                    {/* Dynamic Lighting Envelope */}
                    {lighting === "studio" && (
                        <>
                            <ambientLight intensity={1.5} />
                            <directionalLight position={[5, 10, 5]} intensity={2} castShadow />
                            <pointLight position={[-5, 5, -5]} intensity={1} color="#aaa" />
                        </>
                    )}
                    {lighting === "cinematic" && (
                        <>
                            <ambientLight intensity={0.2} color="#111" />
                            <spotLight position={[0, 10, 0]} angle={0.3} penumbra={1} intensity={5} color="#4f46e5" castShadow />
                            <directionalLight position={[-10, 5, 10]} intensity={1.5} color="#e11d48" />
                            <Environment preset="night" />
                        </>
                    )}
                    {lighting === "natural" && (
                        <>
                            <ambientLight intensity={0.5} />
                            <directionalLight position={[10, 20, 10]} intensity={3} color="#fffbe0" castShadow />
                            <Environment preset="sunset" />
                        </>
                    )}

                    <CameraController isRecording={isRecording} isActive={!selectedAssetId} />

                    {agentTargetPosition && <AgentDirector targetPosition={agentTargetPosition} />}

                    {/* Multi-Asset Compositor */}
                    {assets.map((asset) => {
                        const isSelected = selectedAssetId === asset.id;

                        const content = (
                            <group
                                key={asset.id}
                                position={asset.position}
                                rotation={asset.rotation}
                                scale={asset.scale}
                                onClick={(e) => {
                                    if (!isPlacingAnnotation && onAssetSelect) {
                                        e.stopPropagation();
                                        onAssetSelect(asset.id);
                                    }
                                }}
                            >
                                {asset.type === "glb" ? (
                                    <GLBViewer url={asset.url} />
                                ) : (
                                    <SplatViewer splatUrl={asset.url} />
                                )}
                            </group>
                        );

                        if (isSelected && onAssetTransform) {
                            return (
                                <TransformControls
                                    key={`transform-${asset.id}`}
                                    mode="translate"
                                    object={undefined} // handled internally
                                    onMouseUp={(e: unknown) => {
                                        const obj = (e as { target?: { object?: THREE.Object3D } })?.target?.object;
                                        if (!obj) return;
                                        onAssetTransform(
                                            asset.id,
                                            [obj.position.x, obj.position.y, obj.position.z],
                                            [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                                            [obj.scale.x, obj.scale.y, obj.scale.z]
                                        );
                                    }}
                                >
                                    {content}
                                </TransformControls>
                            );
                        }

                        return content;
                    })}

                    {/* Semantic Annotation Layer */}
                    <AnnotationSystem
                        isPlacing={isPlacingAnnotation}
                        onAnnotationAdded={onAnnotationAdded!}
                        annotations={annotations}
                    />

                    {/* Dynamic Shader & Post-Processing Node Graphs */}
                    {shaderPreset === "vhs" && (
                        <EffectComposer>
                            <Noise opacity={0.3} />
                            <ChromaticAberration offset={[0.005, 0.005] as any} />
                            <Scanline density={1.5} />
                            <Vignette eskil={false} offset={0.1} darkness={1.1} />
                        </EffectComposer>
                    )}
                    {shaderPreset === "dreamy" && (
                        <EffectComposer>
                            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
                            <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />
                            <Vignette eskil={false} offset={0.1} darkness={0.8} />
                        </EffectComposer>
                    )}
                    {shaderPreset === "cyberpunk" && (
                        <EffectComposer>
                            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.1} intensity={2.5} mipmapBlur />
                            <ChromaticAberration offset={[0.015, 0.015] as any} />
                            <Noise opacity={0.2} />
                        </EffectComposer>
                    )}
                </Suspense>
            </Canvas>
        </div>
    );
}
