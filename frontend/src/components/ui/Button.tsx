"use client";

// DESIGN.md components: button-primary (near-black/white pill, 32px radius),
// button-pill-outline, button-secondary (underlined text link).

import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-full disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "btn-gradient text-void hover:opacity-90 rounded-xl",
  outline: "border border-white/10 text-white hover:bg-brand-cyan/5 rounded-xl",
  ghost: "text-white hover:text-brand-cyan underline underline-offset-4",
  danger: "border border-error-red/40 text-error-red hover:bg-error-red/5",
};

const sizes: Record<Size, string> = {
  md: "text-sm px-5 py-2.5",
  lg: "text-base px-7 py-3",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({ variant = "primary", size = "md", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </Link>
  );
}
