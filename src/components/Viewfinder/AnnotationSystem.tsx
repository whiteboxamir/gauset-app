"use client";

import { useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { MapPin } from "lucide-react";

export interface Annotation {
    id: string;
    position: THREE.Vector3;
    text: string;
    type: "egress" | "lighting" | "hazard" | "general";
}

interface AnnotationSystemProps {
    isPlacing: boolean;
    onAnnotationAdded: (annotation: Annotation) => void;
    annotations: Annotation[];
}

export function AnnotationSystem({ isPlacing, onAnnotationAdded, annotations }: AnnotationSystemProps) {
    const { camera, raycaster, pointer, scene } = useThree();
    const [hoverPosition, setHoverPosition] = useState<THREE.Vector3 | null>(null);

    // Raycast every frame to show where the pin will drop
    useFrame(() => {
        if (!isPlacing) {
            if (hoverPosition) setHoverPosition(null);
            return;
        }

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            setHoverPosition(intersects[0].point);
        } else {
            setHoverPosition(null);
        }
    });

    const handleClick = (e: any) => {
        if (!isPlacing || !hoverPosition) return;
        e.stopPropagation(); // Prevents click from bubbling to camera controls

        // Add a new semantic annotation
        const newAnnotation: Annotation = {
            id: Math.random().toString(36).substring(7),
            position: hoverPosition.clone(),
            text: "New Annotation",
            type: "general",
        };

        onAnnotationAdded(newAnnotation);
    };

    return (
        <group onPointerDown={handleClick}>
            {/* Render the ghost pin when hovering in placement mode */}
            {isPlacing && hoverPosition && (
                <group position={hoverPosition}>
                    <Html center zIndexRange={[100, 0]}>
                        <div className="flex flex-col items-center animate-bounce opacity-50 pointer-events-none">
                            <div className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap mb-1">
                                Drop Pin
                            </div>
                            <MapPin className="text-indigo-500 w-6 h-6 drop-shadow-md" />
                        </div>
                    </Html>
                </group>
            )}

            {/* Render existing annotations */}
            {annotations.map((ann) => (
                <group key={ann.id} position={ann.position}>
                    <Html center distanceFactor={10} zIndexRange={[100, 0]}>
                        <div className="group relative flex flex-col items-center">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded border border-white/20 whitespace-nowrap pointer-events-none shadow-xl">
                                {ann.text}
                            </div>

                            {/* Pin UI based on semantic type */}
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer ${ann.type === 'egress' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
                                    ann.type === 'hazard' ? 'bg-red-500/20 border-red-500 text-red-400' :
                                        ann.type === 'lighting' ? 'bg-amber-500/20 border-amber-500 text-amber-400' :
                                            'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                }`}>
                                <MapPin className="w-4 h-4" />
                            </div>
                        </div>
                    </Html>
                </group>
            ))}
        </group>
    );
}
