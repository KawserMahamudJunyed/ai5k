"use client";

// /builder/[id] was a dummy-data page before real profiles existed. Real
// profiles now live at /profiles/[id] — redirect to keep old links working.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function BuilderRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    const id = params?.id;
    if (id) router.replace(`/profiles/${id}`);
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [params, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-white mb-3">
          This page moved
        </h1>
        <p className="text-fog mb-6">
          Builder profiles now live at{" "}
          <code className="text-brand-cyan">/profiles/{params?.id ?? "…"}</code>
          {seconds > 0 && <> — taking you there in {seconds}s…</>}
        </p>
        <a
          href={`/profiles/${params?.id ?? ""}`}
          className="text-brand-cyan hover:text-white transition-colors text-sm"
        >
          Go now
        </a>
      </div>
    </main>
  );
}
