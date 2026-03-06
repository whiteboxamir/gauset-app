'use client';
import { useEffect, useRef, useState } from 'react';
export function HeroBackground() {
    const videoRef = useRef(null);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        if (videoRef.current) {
            // @ts-ignore
            videoRef.current.play().catch(() => { });
        }
    }, []);
    return (
        // Added pointer-events-none to the absolute root to guarantee it never steals touch focus
        <div className="absolute inset-0 bg-transparent pointer-events-none" style={{ zIndex: -10 }}>

            {/* The Video Layer: NEVER animate its opacity on mobile to prevent scroll bricking */}
            <video
                ref={videoRef}
                src="/video/hero-bg.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onCanPlayThrough={() => setVideoReady(true)}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    pointerEvents: 'none'
                    /* Opacity transition REMOVED. It is always 1. */
                }}
            />
            {/* The Fade Layer: A simple black div that fades out instead. 100% safe for iOS Safari. */}
            <div
                className="absolute inset-0 bg-[#050510] pointer-events-none"
                style={{
                    opacity: videoReady ? 0 : 1,
                    transition: 'opacity 1s ease-in-out'
                }}
            />
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(0,0,0,0.55) 0%, transparent 75%)' }} />
        </div>
    );
}
