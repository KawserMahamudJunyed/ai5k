"use client";

// Signup — UF-2. POST /auth/signup; dev-mode verification_token hands off to
// /verify-email. Errors branch on code (email_already_registered, weak_password).

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Field, inputClass, Notice } from "@/components/ui/Bits";
import { signup, ApiError } from "@/lib/api-helpers";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await signup(email.trim(), password, fullName.trim());
      const params = new URLSearchParams({ email: data.email });
      if (data.verification_token) params.set("token", data.verification_token);
      router.push(`/verify-email?${params.toString()}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_already_registered") {
        setError("An account with that email already exists. Try logging in.");
      } else if (err instanceof ApiError && err.code === "weak_password") {
        setError("Password must be at least 8 characters.");
      } else {
        setError((err as Error).message || "Signup failed");
      }
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Left: brand panel */}
      <section className="hidden md:flex flex-col justify-between bg-navy p-12">
        <Link href="/"><Image src="/assets/logo.png" alt="AI5K Logo" width={140} height={40} className="h-8 md:h-10 w-auto object-contain" priority /></Link>
        <div>
          <h2 className="text-section-heading font-display text-white">
            Your evidence,<br />your reputation.
          </h2>
          <p className="text-body text-muted mt-4 max-w-sm">
            Create your account, build an evidence-backed profile, and pursue global opportunities.
          </p>
        </div>
        <p className="text-micro text-muted">No income guarantees. Verification-based access.</p>
      </section>

      {/* Right: form */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-void border border-white/10 rounded-md p-8">
          <h1 className="text-card-heading font-display text-white mb-2">Create your account</h1>
          <p className="text-sm text-muted mb-8">Join the verified AI capability network.</p>

          {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Full name" htmlFor="fullName" required>
              <input id="fullName" type="text" required maxLength={255} value={fullName}
                onChange={(e) => setFullName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Password" htmlFor="password" required hint="(8+ characters)">
              <input id="password" type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Creating…" : "Sign up"}
            </Button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-blue underline underline-offset-4">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}





