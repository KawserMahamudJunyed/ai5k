"use client";

// Shared micro-components implementing DESIGN.md primitives:
// mono uppercase labels, hairline rules, quiet chips, flat surfaces.

import type { ReactNode } from "react";

export function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-micro uppercase tracking-[0.28px] text-muted ${className}`}>
      {children}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "coral" | "green" | "navy" | "red";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-hairline text-muted bg-canvas",
    coral: "border-coral/40 text-coral bg-coral/5",
    green: "border-[#003c33]/30 text-[#003c33] bg-[#edfce9]",
    navy: "border-navy/30 text-navy bg-[#f1f5ff]",
    red: "border-error-red/30 text-error-red bg-error-red/5",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-micro ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1.5">
        {label} {required && <span className="text-error-red">*</span>}
        {hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full bg-canvas border border-hairline rounded-sm px-4 py-2.5 text-ink placeholder:text-muted-2 focus-visible:outline-[#9b60aa]";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-10 h-10 rounded-full border-2 border-hairline border-t-ink animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-error-red/30 bg-error-red/5 text-error-red",
    ok: "border-[#003c33]/30 bg-green-wash text-[#003c33]",
    info: "border-hairline bg-blue-wash text-navy",
  }[kind];
  return <div className={`p-3 rounded-sm border text-sm ${styles}`}>{children}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 border border-hairline rounded-md bg-canvas">
      <p className="text-card-heading text-ink">{title}</p>
      <p className="text-body text-muted mt-2 mb-6 max-w-md mx-auto">{body}</p>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <header className="mb-10">
      <MonoLabel className="block mb-3">{eyebrow}</MonoLabel>
      <h1 className="text-section-heading font-display text-ink">{title}</h1>
      {lede && <p className="text-body-lg text-muted mt-3 max-w-text">{lede}</p>}
    </header>
  );
}
