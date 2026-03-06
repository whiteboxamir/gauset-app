'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function Navbar() {
    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="fixed top-0 inset-x-0 z-50 flex justify-between items-center px-6 py-6 md:px-12 w-full max-w-[1400px] mx-auto mix-blend-difference"
        >
            <Link href="/" className="text-xl md:text-2xl font-medium tracking-tight text-white hover:opacity-80 transition-opacity">
                GAUSET
            </Link>

            <div className="flex items-center gap-6">
                <Link
                    href="/login"
                    className="text-sm border border-white/20 hover:bg-white hover:text-black transition-colors duration-300 px-5 py-2.5 rounded-full text-white backdrop-blur-md bg-white/5"
                >
                    Log In
                </Link>
            </div>
        </motion.header>
    );
}
