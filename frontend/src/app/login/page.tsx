"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import { login, setAuthTokens } from "@/lib/api-helpers";
import { resolvePostLoginPath, sanitizeNextPath } from "@/lib/post-login";
import { Eye, EyeOff } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Suspense } from "react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(email, password);
      setAuthTokens(data.access_token, data.refresh_token);
      const next = sanitizeNextPath(searchParams.get("next"));
      router.push(next ?? (await resolvePostLoginPath()));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "email_not_verified") {
        setError("Please verify your email first — check your inbox.");
      } else if (code === "account_suspended") {
        setError("This account has been suspended.");
      } else {
        setError((err as Error).message || "Invalid credentials");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center  p-6 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-blue/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-10">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <div className="relative w-56 h-20">
              <Image src="/assets/logo.png" alt="AI5K Logo" fill className="object-contain" />
            </div>
          </Link>
        </div>
        
        <div className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h1 className="font-display text-2xl font-bold text-white mb-2">Log in to your account</h1>
          <p className="text-fog mb-8">Enter your details to access the AI5K network.</p>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="email">Email</label>
              <input 
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow placeholder:text-white/20"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-fog" htmlFor="password">Password</label>
                <Link href="/forgot-password" className="text-xs text-brand-cyan hover:text-white transition-colors">Forgot password?</Link>
              </div>
              <div className="relative">
                <input 
                  id="password" type={showPassword ? "text" : "password"} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-void border border-white/10 rounded-lg pl-4 pr-11 py-3 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow placeholder:text-white/20"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fog hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <Button type="submit" className="w-full py-3" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-fog">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-white hover:text-brand-cyan font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}


