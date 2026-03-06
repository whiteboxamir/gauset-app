'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

const LENS_VALUES = ['50mm', '85mm', '35mm'];
const CAMERA_VALUES = ['Dolly', 'Orbit', 'Crane'];
const SCENE_VALUES = ['SC 01', 'SC 02', 'SC 03'];
const TAKE_VALUES = ['TK 3', 'TK 7', 'TK 2'];
const CYCLE_INTERVAL = 8000;

/**
 * Timecode component — updates via requestAnimationFrame + direct DOM mutation.
 * Zero React re-renders, safe inside scroll containers.
 */
function Timecode({ mono }: { mono: React.CSSProperties }) {
    const tcRef = useRef<HTMLDivElement>(null);
    const startRef = useRef(Date.now());

    useEffect(() => {
        let raf: number;
        const update = () => {
            if (tcRef.current) {
                const elapsed = Date.now() - startRef.current;
                const totalFrames = Math.floor(elapsed / (1000 / 24));
                const frames = totalFrames % 24;
                const totalSeconds = Math.floor(totalFrames / 24);
                const seconds = totalSeconds % 60;
                const minutes = Math.floor(totalSeconds / 60) % 60;
                const hours = Math.floor(totalSeconds / 3600);
                tcRef.current.textContent =
                    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
            }
            raf = requestAnimationFrame(update);
        };
        raf = requestAnimationFrame(update);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div
            className="absolute"
            style={{
                bottom: '36px',
                right: '40px',
                ...mono,
                textAlign: 'right',
                lineHeight: '2',
            }}
        >
            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>TC</div>
            <div
                ref={tcRef}
                style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
            >
                00:00:00:00
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.55)' }}>24 FPS · 4K</div>
        </div>
    );
}

export function DirectorOverlay() {
    const [index, setIndex] = useState(0);
    const [visible, setVisible] = useState(true);
    const [glitch, setGlitch] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setVisible(false);
            setGlitch(true);
            setTimeout(() => {
                setGlitch(false);
                setIndex((prev) => (prev + 1) % LENS_VALUES.length);
                setVisible(true);
            }, 600);
        }, CYCLE_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    const mono: React.CSSProperties = {
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Courier New", monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2, delay: 4.0, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 2 }}
        >
            {/* ── Viewfinder border frame ── */}
            <div
                className="absolute"
                style={{
                    inset: '60px 24px 24px 24px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '2px',
                    boxSizing: 'border-box',
                }}
            />

            {/* ── Corner brackets ── */}
            <div className="absolute" style={{ top: '56px', left: '20px' }}>
                <div style={{ width: '20px', height: '20px', borderTop: '2px solid rgba(255,255,255,0.3)', borderLeft: '2px solid rgba(255,255,255,0.3)' }} />
            </div>
            <div className="absolute" style={{ top: '56px', right: '20px' }}>
                <div style={{ width: '20px', height: '20px', borderTop: '2px solid rgba(255,255,255,0.3)', borderRight: '2px solid rgba(255,255,255,0.3)' }} />
            </div>
            <div className="absolute" style={{ bottom: '20px', left: '20px' }}>
                <div style={{ width: '20px', height: '20px', borderBottom: '2px solid rgba(255,255,255,0.3)', borderLeft: '2px solid rgba(255,255,255,0.3)' }} />
            </div>
            <div className="absolute" style={{ bottom: '20px', right: '20px' }}>
                <div style={{ width: '20px', height: '20px', borderBottom: '2px solid rgba(255,255,255,0.3)', borderRight: '2px solid rgba(255,255,255,0.3)' }} />
            </div>

            {/* ── Bottom-left: REC + metadata ── */}
            <div
                className="absolute"
                style={{ bottom: '36px', left: '40px', ...mono, fontSize: '11px', lineHeight: '2', color: 'rgba(255, 255, 255, 0.80)' }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <div
                        className="w-2 h-2 bg-red-500 rounded-full animate-pulse"
                        style={{
                            boxShadow: '0 0 10px rgba(239,68,68,0.8)',
                        }}
                    />
                    <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontWeight: 500 }}>REC</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.4)', margin: '0 2px' }}>·</span>
                    <span style={{
                        display: "inline-block",
                        width: "6px",
                        height: "6px",
                        background: "red",
                        borderRadius: "50%",
                        marginRight: "6px",
                        animation: "pulse 1.5s infinite"
                    }} />
                    <span style={{ color: 'rgba(255, 255, 255, 0.80)' }}>DIRECTOR VIEW</span>
                </div>
                <div
                    style={{
                        opacity: glitch ? 0.4 : visible ? 1 : 0,
                        transition: glitch ? 'opacity 0.08s ease-out' : 'opacity 0.6s ease-in-out',
                        color: 'rgba(255, 255, 255, 0.80)',
                        filter: glitch ? 'brightness(1.6)' : 'none',
                    }}
                >
                    <div>{SCENE_VALUES[index]} · {TAKE_VALUES[index]}</div>
                    <div>Lens: {LENS_VALUES[index]} · Camera: {CAMERA_VALUES[index]}</div>
                </div>
            </div>

            {/* ── Bottom-right: Timecode (zero re-renders — uses rAF + direct DOM) ── */}
            <Timecode mono={mono} />

            {/* ── Top-left: Format ── */}
            <div
                className="absolute"
                style={{ top: '72px', left: '40px', ...mono, fontSize: '10px', color: 'rgba(255, 255, 255, 0.65)', animation: 'overlay-drift 6s ease-in-out infinite' }}
            >
                2.39:1 · ANAMORPHIC
            </div>

            {/* ── Top-right: Color ── */}
            <div
                className="absolute"
                style={{ top: '72px', right: '40px', ...mono, fontSize: '10px', color: 'rgba(255, 255, 255, 0.65)', textAlign: 'right', animation: 'overlay-drift 6s ease-in-out infinite 3s' }}
            >
                ACES · LOG
            </div>

            {/* ── Center crosshair ── */}
            <div
                className="absolute"
                style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '28px',
                    height: '28px',
                    opacity: 0.12,
                }}
            >
                <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '1px', background: 'white' }} />
                <div style={{ position: 'absolute', left: '50%', top: '0', bottom: '0', width: '1px', background: 'white' }} />
            </div>

            {/* ── Scanline overlay ── */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
                    pointerEvents: 'none',
                }}
            />
        </motion.div>
    );
}
