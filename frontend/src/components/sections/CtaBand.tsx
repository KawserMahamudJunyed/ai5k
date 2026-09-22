"use client";

import { SITE_COPY } from "@/lib/constants";
import Button from "@/components/ui/Button";
import { motion, useReducedMotion } from "framer-motion";

export default function CtaBand() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section 
      className="py-20 lg:py-32 px-6 divider-gradient-top"
      initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="max-w-5xl mx-auto rounded-2xl bg-gradient-to-b from-navy/30 to-transparent border border-white/10 p-10 md:p-16 text-center">
        <h2 className="font-display text-3xl md:text-[32px] font-bold tracking-tight mb-10 max-w-xl mx-auto">
          {SITE_COPY.ctaBand.heading}
        </h2>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Button href={SITE_COPY.ctaBand.primaryCta.href} variant="primary" className="w-full sm:w-auto">
            {SITE_COPY.ctaBand.primaryCta.label}
          </Button>
          <Button href={SITE_COPY.ctaBand.secondaryCta.href} variant="secondary" className="w-full sm:w-auto">
            {SITE_COPY.ctaBand.secondaryCta.label}
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

