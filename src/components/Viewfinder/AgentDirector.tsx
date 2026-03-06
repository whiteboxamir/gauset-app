"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useRef } from "react";

interface AgentDirectorProps {
    targetPosition: number[] | null;
}

export function AgentDirector({ targetPosition }: AgentDirectorProps) {
    const { camera } = useThree();
    const isMoving = useRef(false);
    const targetVec = useRef(new THREE.Vector3());
    const startVec = useRef(new THREE.Vector3());
    const progress = useRef(0);

    useEffect(() => {
        if (targetPosition) {
            targetVec.current.set(targetPosition[0], targetPosition[1] + 1.5, targetPosition[2] + 2); // Offset to look AT the pin
            startVec.current.copy(camera.position);
            progress.current = 0;
            isMoving.current = true;
        }
    }, [targetPosition, camera]);

    useFrame((state, delta) => {
        if (isMoving.current) {
            progress.current += delta * 0.5; // Speed of movement

            if (progress.current >= 1) {
                camera.position.copy(targetVec.current);
                isMoving.current = false;
                progress.current = 1;
            } else {
                // Smooth interpolation
                camera.position.lerpVectors(startVec.current, targetVec.current, progress.current);

                // Also look at the target while moving
                const targetLookAt = new THREE.Vector3(targetPosition![0], targetPosition![1], targetPosition![2]);
                camera.lookAt(targetLookAt);
            }
        }
    });

    return null;
}
