import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BackgroundNoise } from '@/components/ui/BackgroundNoise';
import Link from 'next/link';

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token');

    if (!token) {
        redirect('/login');
    }

    const userEmail = token.value;

    return (
        <main className="min-h-screen bg-black text-white selection:bg-white/20 relative p-6 md:p-12 font-sans">
            <BackgroundNoise />
            {/* Background gradients */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vh] bg-neutral-900/40 rounded-full blur-[120px] mix-blend-screen opacity-50 transition-opacity duration-[30s]" />
            </div>

            <div className="relative z-10 w-full max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000">

                {/* Dashboard Header */}
                <header className="flex justify-between items-center w-full border-b border-white/[0.05] pb-8 mb-12">
                    <Link href="/" className="text-2xl font-medium tracking-tight hover:opacity-80 transition-opacity">
                        GAUSET
                    </Link>

                    <div className="flex items-center gap-6 text-sm">
                        <span className="text-neutral-500 font-medium tracking-wide">{userEmail}</span>
                        <Link
                            href="/api/auth/logout"
                            className="border border-white/20 hover:bg-white hover:text-black transition-colors duration-300 px-5 py-2.5 rounded-full text-white backdrop-blur-md bg-white/5"
                        >
                            Log Out
                        </Link>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
                    <aside className="md:col-span-3">
                        <nav className="flex flex-col gap-4 text-neutral-400 font-medium text-sm tracking-wide">
                            <button className="text-left text-white px-4 py-3 bg-white/[0.05] rounded-xl border border-white/[0.05]">Projects</button>
                            <button className="text-left px-4 py-3 hover:text-white transition-colors">Team Assets</button>
                            <button className="text-left px-4 py-3 hover:text-white transition-colors">Agents / Crew</button>
                            <button className="text-left px-4 py-3 hover:text-white transition-colors">Billing</button>
                        </nav>
                    </aside>

                    <main className="md:col-span-9 flex flex-col gap-8">
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <h1 className="text-4xl font-medium tracking-tighter mb-2 text-white">Your Worlds</h1>
                                <p className="text-neutral-500 font-medium">Manage and direct your persistent neural spaces.</p>
                            </div>
                            <button className="bg-[#00ff9d] text-black font-medium px-6 py-3 rounded-full text-sm hover:opacity-80 transition-opacity shadow-[0_0_20px_rgba(0,255,157,0.2)]">
                                + New World
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Dummy Project Cards */}
                            {[
                                { title: "Sci-Fi Metropolis", date: "Updated 2h ago", status: "Render Complete" },
                                { title: "Cyber-Noir Scene 4", date: "Updated 5h ago", status: "Agent Generating" },
                                { title: "Commercial Demo", date: "Updated 2d ago", status: "Ready for Polish" }
                            ].map((proj, i) => (
                                <div key={i} className="group relative bg-[#050505] border border-white/[0.08] hover:border-white/[0.2] transition-colors duration-500 rounded-[2rem] p-6 aspect-square flex flex-col justify-end overflow-hidden cursor-pointer">
                                    <div className="absolute inset-0 bg-neutral-900/50 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-700" />
                                    <div className="relative z-10">
                                        <h3 className="text-xl font-medium tracking-tight mb-2 text-white">{proj.title}</h3>
                                        <div className="flex justify-between items-center text-xs font-medium text-neutral-500 tracking-wide uppercase">
                                            <span>{proj.date}</span>
                                            <span className={proj.status === 'Agent Generating' ? 'text-[#00ff9d]' : ''}>{proj.status}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </main>
                </div>

            </div>
        </main>
    );
}
