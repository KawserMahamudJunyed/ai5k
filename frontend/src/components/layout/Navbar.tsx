"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { SITE_COPY } from "@/lib/constants";
import Button from "@/components/ui/Button";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [mobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ease-out ${
        mobileMenuOpen
          ? "bg-void border-b border-white/10" // Solid dark background when menu is open
          : scrolled
          ? "bg-void/70 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.3)] saturate-[1.1]" 
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 md:h-28 flex items-center justify-between">
        
        {/* Logo (2x Responsive Sizing) */}
        <Link
          href="#top"
          className="flex items-center focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded group z-50"
          aria-label="AI5K Home"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="relative w-48 h-12 md:w-72 md:h-20 lg:w-96 lg:h-24 transition-transform duration-300 group-hover:-translate-y-0.5">
            <Image
              src="/assets/logo.png"
              alt="AI5K Logo"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-8" aria-label="Main Navigation">
          {SITE_COPY.nav.links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="relative text-sm font-medium text-fog hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded px-2 py-1 nav-link-animated"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href={SITE_COPY.nav.signIn.href}
            className="relative text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded px-2 py-1 nav-link-animated"
          >
            {SITE_COPY.nav.signIn.label}
          </Link>
          <Button href={SITE_COPY.nav.primaryCta.href} variant="primary">
            {SITE_COPY.nav.primaryCta.label}
          </Button>
        </div>

        {/* Mobile Hamburger Button */}
        <button 
          className="md:hidden p-2 text-white z-50 focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded-md"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full left-0 w-full h-[100dvh] bg-void border-t border-white/10 md:hidden flex flex-col p-6 overflow-y-auto pb-32"
          >
            <nav className="flex flex-col gap-6 mt-4">
              {SITE_COPY.nav.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-medium text-fog hover:text-white transition-colors border-b border-white/5 pb-4"
                >
                  {link.label}
                </Link>
              ))}
              
              <div className="flex flex-col gap-4 mt-8">
                <Link
                  href={SITE_COPY.nav.signIn.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-medium text-center text-white py-3 border border-white/10 rounded-lg"
                >
                  {SITE_COPY.nav.signIn.label}
                </Link>
                <Button href={SITE_COPY.nav.primaryCta.href} variant="primary" className="w-full justify-center py-4">
                  {SITE_COPY.nav.primaryCta.label}
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
