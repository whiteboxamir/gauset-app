'use client';

import { useState } from 'react';
import { loginUser } from '@/app/actions';
import { ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function LoginForm() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (status === 'loading') return;

        setStatus('loading');
        const formData = new FormData(e.currentTarget);
        const result = await loginUser(formData);

        if (result.success) {
            setStatus('success');
            setMessage(result.message);
            // Premium redirect delay
            setTimeout(() => {
                router.push('/dashboard');
            }, 500);
        } else {
            setStatus('idle');
            setMessage(result.message);
        }
    };

    return (
        <div className="w-full max-w-[400px] mx-auto p-8 bg-[#0a0a0a] border border-white/[0.05] rounded-[2rem] shadow-2xl relative z-10 backdrop-blur-xl">
            <Link href="/" className="inline-block text-xl font-medium tracking-tight text-white mb-10 hover:opacity-80 transition-opacity">
                GAUSET
            </Link>

            <h1 className="text-3xl font-medium tracking-tighter mb-2 text-white/90">Welcome back</h1>
            <p className="text-neutral-500 mb-8 font-medium">Log in to enter the World Engine.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="text-xs text-neutral-400 font-medium uppercase tracking-widest pl-2">Email Address</label>
                <div className="relative group flex w-full">
                    <input
                        type="email"
                        name="email"
                        placeholder="producer@studio.com"
                        required
                        disabled={status !== 'idle'}
                        className={cn(
                            'w-full bg-white/[0.03] border border-white/[0.1] text-white rounded-2xl px-5 py-4 text-base',
                            'placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all duration-300',
                            'group-hover:bg-white/[0.05] group-hover:border-white/[0.2]',
                        )}
                    />
                </div>

                <button
                    type="submit"
                    disabled={status !== 'idle'}
                    className={cn(
                        'mt-4 w-full rounded-2xl py-4 flex items-center justify-center font-medium shadow-[0_0_20px_rgba(255,255,255,0.1)]',
                        'transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                        status === 'success' ? 'bg-[#00ff9d] text-black shadow-[0_0_40px_rgba(0,255,157,0.3)]' : 'bg-white text-black hover:bg-neutral-200'
                    )}
                >
                    <AnimatePresence mode="wait">
                        {status === 'idle' && (
                            <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                Continue to Dashboard <ArrowRight className="w-4 h-4" />
                            </motion.div>
                        )}
                        {status === 'loading' && (
                            <motion.div key="loader" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            </motion.div>
                        )}
                        {status === 'success' && (
                            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {message}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>

                {message && status === 'idle' && (
                    <p className="text-red-400 text-sm font-medium text-center mt-2">{message}</p>
                )}
            </form>
        </div>
    );
}
