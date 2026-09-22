"use client";

import Image from "next/image";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi, ApiError } from "@/lib/api";
import { verifyEmail } from "@/lib/api-helpers";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function activate(token: string) {
    setStatus("verifying");
    try {
      await verifyEmail(token);
      setStatus("success");
      setMessage("Email verified! Redirecting to log in…");
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof ApiError && err.code === "invalid_token"
          ? "This verification link is invalid or expired."
          : (err as Error).message || "Verification failed. Please try again.",
      );
    }
  }

  // Local dev: signup stashes the verification token in sessionStorage, so we
  // can activate immediately without a real email round-trip.
  useEffect(() => {
    const token = sessionStorage.getItem("ai5k_verification_token");
    if (token) {
      sessionStorage.removeItem("ai5k_verification_token");
      void activate(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await activate(String(form.get("token") || ""));
  }

  return (
    <div className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
      <div className="w-16 h-16 bg-brand-cyan/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      {status === "success" ? (
        <>
          <h1 className="font-display text-2xl font-bold text-white mb-2">Email verified</h1>
          <p className="text-fog mb-8">{message}</p>
        </>
      ) : status === "verifying" ? (
        <>
          <h1 className="font-display text-2xl font-bold text-white mb-2">Verifying…</h1>
          <p className="text-fog mb-8">Activating your account.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-fog mb-8">
            We sent a verification code to <strong className="text-white font-medium">{email || "your email"}</strong>
          </p>

          {status === "error" && (
            <p className="text-sm text-red-400 font-medium mb-6">{message}</p>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-4 mb-6">
            <input
              name="token"
              type="text"
              required
              placeholder="Paste verification token"
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow placeholder:text-white/20"
            />
            <button
              type="submit"
              className="text-sm text-brand-cyan hover:text-white font-medium transition-colors"
            >
              Verify email
            </button>
          </form>
        </>
      )}

      <div className="mt-8 pt-6 border-t border-white/10">
        <Link href="/login" className="text-sm text-fog hover:text-white transition-colors">
          Return to log in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center  p-6 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-mint/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-10">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <div className="relative w-56 h-20">
              <Image src="/assets/logo.png" alt="AI5K Logo" fill className="object-contain" />
            </div>
          </Link>
        </div>
        <Suspense fallback={<div className="text-fog text-center">Loading...</div>}>
          <VerifyEmailForm />
        </Suspense>
      </div>
    </main>
  );
}
