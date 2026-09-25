"use client";

// Verify-email — UF-2. Auto-submits the token (dev flow); on success shows
// confirmation then routes to /login. Errors are terminal with a retry link.

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Notice, Spinner } from "@/components/ui/Bits";
import { verifyEmail } from "@/lib/api-helpers";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const [state, setState] = useState<"verifying" | "done" | "error">(token ? "verifying" : "error");
  const [message, setMessage] = useState(token ? "" : "No verification token found.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(() => setState("done"))
      .catch((err) => {
        setState("error");
        setMessage((err as Error).message || "Verification failed.");
      });
  }, [token]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => {
      window.location.href = `/login${email ? `?email=${encodeURIComponent(email)}` : ""}`;
    }, 1500);
    return () => clearTimeout(t);
  }, [state, email]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-navy">
      <div className="w-full max-w-md bg-void border border-white/10 rounded-md p-10 text-center">
        {state === "verifying" && (
          <>
            <div className="flex justify-center mb-6"><Spinner /></div>
            <h1 className="text-card-heading font-display text-white">Verifying your email…</h1>
          </>
        )}
        {state === "done" && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-wash border border-[#003c33]/30 text-[#003c33] flex items-center justify-center text-xl mx-auto mb-6">✓</div>
            <h1 className="text-card-heading font-display text-white mb-2">Email verified!</h1>
            <p className="text-sm text-muted">Taking you to log in…</p>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-card-heading font-display text-white mb-4">Verification problem</h1>
            <Notice kind="error">{message}</Notice>
            <p className="text-sm text-muted mt-6">
              Try <Link href="/login" className="text-blue underline underline-offset-4">logging in</Link> or sign up again.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
