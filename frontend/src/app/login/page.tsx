"use client";

// Login — UF-3. POST /auth/login, then smart routing (post-login.ts):
// ?next= > profile exists → /profile/me > else onboarding.
// Account states: email_not_verified, account_suspended.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import { Field, inputClass, Notice } from "@/components/ui/Bits";
import { login, setAuthTokens, ApiError } from "@/lib/api-helpers";
import { resolvePostLoginRoute } from "@/lib/post-login";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill from the verify-email handoff.
  useEffect(() => {
    const prefill = searchParams.get("email");
    if (prefill) setEmail(prefill);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await login(email.trim(), password);
      setAuthTokens(data.access_token, data.refresh_token);
      const next = await resolvePostLoginRoute();
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_not_verified") {
        setError("Please verify your email before logging in. Check the verification link.");
      } else if (err instanceof ApiError && err.code === "account_suspended") {
        setError("This account has been suspended. Contact support.");
      } else if (err instanceof ApiError && err.code === "invalid_credentials") {
        setError("Incorrect email or password.");
      } else {
        setError((err as Error).message || "Login failed");
      }
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      <section className="hidden md:flex flex-col justify-between bg-navy p-12">
        <Link href="/"><Image src="/assets/logo.png" alt="AI5K Logo" width={140} height={40} className="h-8 md:h-10 w-auto object-contain" priority /></Link>
        <div>
          <h2 className="text-section-heading font-display text-white">
            Evidence over<br />assertion.
          </h2>
          <p className="text-body text-muted mt-4 max-w-sm">
            Log in to your verified capability profile.
          </p>
        </div>
        <p className="text-micro text-muted">Global AI Capability Network</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-void border border-white/10 rounded-md p-8">
          <h1 className="text-card-heading font-display text-white mb-2">Log in</h1>
          <p className="text-sm text-muted mb-8">Welcome back.</p>

          {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email" htmlFor="email" required>
              <input id="email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <input id="password" type="password" required autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            New here?{" "}
            <Link href="/signup" className="text-blue underline underline-offset-4">Create an account</Link>
          </p>
        </div>
      </section>
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





