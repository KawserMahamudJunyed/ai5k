"use client";

import Link from "next/link";
import { ReactNode, forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
}

// Minimal wrapper to avoid Framer Motion type conflicts on Next.js Link
const MotionLink = motion(forwardRef<HTMLAnchorElement, { href: string; className?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement>; children?: React.ReactNode }>(function InnerLink(props, ref) {
  const { href, ...rest } = props; return <Link ref={ref} href={href} {...rest} />;
}));
MotionLink.displayName = "MotionLink";

export default function Button({ children, variant = "primary", className = "", href, type = "button", disabled, onClick }: ButtonProps) {
  const shouldReduceMotion = useReducedMotion();
  const baseClasses = "inline-flex items-center justify-center px-6 py-2.5 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:ring-offset-2 focus:ring-offset-void disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "btn-gradient",
    secondary: "btn-outline",
  };

  const combinedClasses = `${baseClasses} ${variants[variant]} ${className}`;
  
  const hoverAnimation = variant === "primary" && !shouldReduceMotion
    ? { scale: 1.02, filter: "brightness(1.1)" }
    : {};

  const transition = { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const };

  if (href) {
    return (
      <MotionLink 
        href={href} 
        className={combinedClasses}
        whileHover={hoverAnimation}
        transition={transition}
        onClick={onClick}
      >
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button 
      type={type}
      className={combinedClasses}
      whileHover={hoverAnimation}
      transition={transition}
      disabled={disabled}
      onClick={onClick as unknown as React.MouseEventHandler<HTMLButtonElement>}
    >
      {children}
    </motion.button>
  );
}





