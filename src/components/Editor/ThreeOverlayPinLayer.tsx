"use client";

import React from "react";
import { Html } from "@react-three/drei";
import { MapPin } from "lucide-react";

import { type SpatialPin, type SpatialPinType, formatPinTypeLabel } from "@/lib/mvp-workspace";
import { pinColors } from "./threeOverlayShared";
import { useThreeOverlayPinLayerController } from "./useThreeOverlayPinLayerController";

export const PinLayer = React.memo(function PinLayer({
    pins,
    selectedPinId,
    isPlacingPin,
    pinType,
    readOnly,
    onAddPin,
    onSelectPin,
}: {
    pins: SpatialPin[];
    selectedPinId?: string | null;
    isPlacingPin: boolean;
    pinType: SpatialPinType;
    readOnly: boolean;
    onAddPin: (pin: SpatialPin) => void;
    onSelectPin?: (pinId: string | null) => void;
}) {
    const pinLayer = useThreeOverlayPinLayerController({
        isPlacingPin,
        pinType,
        readOnly,
        onAddPin,
    });

    return (
        <group onPointerDown={pinLayer.handlePointerDown}>
            {isPlacingPin && pinLayer.hoverPosition ? (
                <group position={pinLayer.hoverPosition}>
                    <Html center zIndexRange={[100, 0]}>
                        <div className="flex flex-col items-center opacity-75 pointer-events-none">
                            <div className="mb-1 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">
                                Drop {formatPinTypeLabel(pinType)}
                            </div>
                            <MapPin className="h-5 w-5 text-sky-300" />
                        </div>
                    </Html>
                </group>
            ) : null}
            {pins.map((pin) => {
                const isSelected = pin.id === selectedPinId;
                return (
                    <group key={pin.id} position={pin.position}>
                        <Html center distanceFactor={10} zIndexRange={[100, 0]}>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectPin?.(pin.id);
                                }}
                                className={`group relative flex h-8 w-8 items-center justify-center rounded-full border text-xs shadow-lg transition-transform hover:scale-110 ${pinColors(pin.type, isSelected)}`}
                                title={pin.label}
                            >
                                <MapPin className="h-4 w-4" />
                                <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    {pin.label}
                                </span>
                            </button>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
});
