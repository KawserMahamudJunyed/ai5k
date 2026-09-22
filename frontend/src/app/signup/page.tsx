"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { signup } from "@/lib/api-helpers";
import { Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const calculateStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.match(/[a-z]/) && pass.match(/[A-Z]/)) score += 1;
    if (pass.match(/\d/)) score += 1;
    if (pass.match(/[^a-zA-Z\d]/)) score += 1;
    return score;
  };

  const strength = calculateStrength(password);
  
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await signup(email, password, fullName);

      // ENV=local only: backend returns the verification token directly —
      // stash it so /verify-email can activate the account without email.
      if (data.verification_token) {
        sessionStorage.setItem("ai5k_verification_token", data.verification_token);
      }
      // New users always land on verify-email; login applies the smart
      // post-login routing (profile vs onboarding).
      router.push("/verify-email?email=" + encodeURIComponent(email));
    } catch (err) {
      setError((err as Error).message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center  p-6 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-violet/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-10">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <div className="relative w-56 h-20">
              <Image src="/assets/logo.png" alt="AI5K Logo" fill className="object-contain" />
            </div>
          </Link>
        </div>
        
        <div className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h1 className="font-display text-2xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-fog mb-8">Join the verified AI capability network.</p>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="fullName">Full name</label>
              <input 
                id="fullName" type="text" required
                value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-violet transition-shadow placeholder:text-white/20"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="email">Email</label>
              <input 
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-violet transition-shadow placeholder:text-white/20"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="password">Password</label>
              <div className="relative mb-2">
                <input 
                  id="password" type={showPassword ? "text" : "password"} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-void border border-white/10 rounded-lg pl-4 pr-11 py-3 text-white focus:ring-2 focus:ring-brand-violet transition-shadow placeholder:text-white/20"
                  placeholder="Create a strong password"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fog hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              
              {password.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3, 4].map((level) => (
                    <div 
                      key={level} 
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        strength >= level 
                          ? strength === 1 ? 'bg-red-400' 
                            : strength === 2 ? 'bg-orange-400' 
                            : strength === 3 ? 'bg-brand-cyan' 
                            : 'bg-brand-mint'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              )}
              {password.length > 0 && (
                <p className={`text-xs mt-1.5 ${strength < 2 ? 'text-red-400' : strength < 4 ? 'text-brand-cyan' : 'text-brand-mint'}`}>
                  {strength < 2 ? 'Weak' : strength < 4 ? 'Good' : 'Strong'}
                </p>
              )}
            </div>
            
            <Button type="submit" className="w-full py-3 mt-4" disabled={loading || (password.length > 0 && strength < 2)}>
              {loading ? "Creating account..." : "Sign up"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-fog">
            Already have an account?{" "}
            <Link href="/login" className="text-white hover:text-brand-violet font-medium transition-colors">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

