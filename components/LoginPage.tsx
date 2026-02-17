import React, { useState } from 'react';
import { Eye, EyeOff, Check, ArrowRight } from 'lucide-react';

interface LoginPageProps {
    onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            onLogin();
        }, 800);
    };

    return (
        <div className="min-h-screen w-full bg-zinc-50 dark:bg-black flex items-center justify-center p-4 transition-colors duration-300">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-black dark:bg-white rounded-lg mx-auto mb-4 flex items-center justify-center">
                         <span className="text-white dark:text-black font-bold text-xl tracking-tighter">M</span>
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Welcome back</h1>
                    <p className="text-sm text-zinc-500 mt-2">Enter your credentials to access the workspace</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Email</label>
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all text-sm text-zinc-900 dark:text-white"
                            placeholder="name@company.com"
                        />
                    </div>
                    
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Password</label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-3 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all text-sm text-zinc-900 dark:text-white"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div 
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-black dark:bg-white border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800'}`}
                                onClick={(e) => { e.preventDefault(); setRememberMe(!rememberMe); }}
                            >
                                {rememberMe && <Check size={10} className="text-white dark:text-black" />}
                            </div>
                            <span className="text-xs text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 select-none" onClick={(e) => { e.preventDefault(); setRememberMe(!rememberMe); }}>Remember me</span>
                        </label>
                        <a href="#" className="text-xs font-medium text-zinc-900 dark:text-white hover:underline">Forgot password?</a>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {isLoading ? 'Logging in...' : 'Sign In'}
                        {!isLoading && <ArrowRight size={16} />}
                    </button>
                </form>

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase" />
                    </div>

                    <div className="mt-6">
                        <button disabled className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors opacity-60 cursor-not-allowed" title="Coming Soon">
                           <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
                                <path d="M12.0003 20.45c4.6667 0 8.45-3.7833 8.45-8.45 0-4.6667-3.7833-8.45-8.45-8.45-4.6667 0-8.45 3.7833-8.45 8.45 0 4.6667 3.7833 8.45 8.45 8.45Z" fill="#fff" fillOpacity="0" stroke="none"/>
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Google</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;