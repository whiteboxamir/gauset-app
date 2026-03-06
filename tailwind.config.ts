import type { Config } from "tailwindcss";

export default {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                'cinematic-deep': 'var(--cinematic-deep)',
                'cinematic-teal': 'var(--cinematic-teal)',
                'cinematic-amber': 'var(--cinematic-amber)',
                'cinematic-blue': 'var(--cinematic-blue)',
            },
            keyframes: {
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                },
                'glow-pulse': {
                    '0%, 100%': { opacity: '0.4' },
                    '50%': { opacity: '0.7' },
                },
            },
            animation: {
                shimmer: 'shimmer 2s ease-in-out infinite',
                'glow-pulse': 'glow-pulse 6s ease-in-out infinite',
            },
        },
    },
    plugins: [],
} satisfies Config;
