import { LoginForm } from '@/components/ui/LoginForm';
import { BackgroundNoise } from '@/components/ui/BackgroundNoise';

export default function LoginPage() {
    return (
        <main className="min-h-screen bg-black text-white selection:bg-white/20 relative flex flex-col items-center justify-center p-6">
            <BackgroundNoise />
            {/* Background gradients */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vh] bg-neutral-900/40 rounded-full blur-[120px] mix-blend-screen opacity-50" />
                <div className="absolute top-[30%] right-[-10%] w-[40vw] h-[50vh] bg-[#111] rounded-full blur-[100px] mix-blend-screen opacity-40" />
            </div>

            <div className="relative z-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000">
                <LoginForm />
            </div>
        </main>
    );
}
