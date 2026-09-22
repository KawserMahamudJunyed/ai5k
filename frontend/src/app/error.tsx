"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
        System Error
      </h1>
      <p className="text-lg text-fog mb-8 max-w-md">
        An unexpected error occurred while loading this capability.
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          className="btn-shimmer rounded-lg px-8 py-3.5 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-cyan"
        >
          Try again
        </button>
        <Button href="/" variant="secondary">
          Back to home
        </Button>
      </div>
    </div>
  );
}
