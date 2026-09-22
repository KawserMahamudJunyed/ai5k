"use client";

import { Tier } from "@/lib/types";
import { Check } from "lucide-react";
import { motion, useReducedMotion, Variants } from "framer-motion";

interface VerificationLadderProps {
  tiers: Tier[];
  activeTier?: number;
}

export default function VerificationLadder({ tiers, activeTier }: VerificationLadderProps) {
  const shouldReduceMotion = useReducedMotion();

  // Stagger children animation
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVariants: Variants = shouldReduceMotion ? {} : {
    hidden: { opacity: 0, scaleY: 0 },
    show: { 
      opacity: 1, 
      scaleY: 1,
      transition: { type: "spring" as const, stiffness: 80, damping: 15, mass: 1 }
    }
  };

  return (
    <div 
      className="w-full overflow-x-auto pb-8 pt-4 custom-scrollbar"
      role="group"
      aria-label="Verification Evidence Ladder"
    >
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="flex items-end gap-2 md:gap-4 min-w-[760px] h-[280px]"
      >
        {tiers.map((tier, i) => {
          const isTopTier = tier.weight === 1.0;
          const isActive = activeTier !== undefined && activeTier === i;
          
          // Map weight to pixel height (min 60px, max 200px)
          const barHeight = Math.max(60, Math.floor(tier.weight * 200));

          return (
            <div 
              key={tier.name} 
              className={`flex-1 flex flex-col justify-end group transition-all duration-300 ${isActive ? 'opacity-100' : (activeTier !== undefined ? 'opacity-40' : 'opacity-100')}`}
            >
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="mb-4"
              >
                <p className={`text-xs md:text-sm font-medium mb-1 ${isTopTier ? 'text-brand-mint' : 'text-white'}`}>
                  {tier.name}
                </p>
                <p className="font-mono text-[10px] md:text-xs text-fog uppercase tracking-widest">
                  weight {tier.weight.toFixed(2)}
                </p>
              </motion.div>

              <motion.div 
                variants={itemVariants}
                whileHover={shouldReduceMotion ? {} : { scale: 1.02, filter: "brightness(1.15)" }}
                className={`w-full rounded-t-lg relative cursor-pointer`}
                style={{ 
                  height: `${barHeight}px`,
                  backgroundColor: isTopTier ? undefined : `var(--color-${tier.color})`,
                  backgroundImage: isTopTier ? 'var(--gradient-brand)' : undefined,
                  transformOrigin: "bottom center"
                }}
                role="img"
                aria-label={`Tier ${i + 1}: ${tier.name}, weight ${tier.weight.toFixed(2)}`}
                title={tier.name}
              >
                {/* Verified Check Badge for Top Tier */}
                {isTopTier && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    transition={{ type: "spring" as const, stiffness: 200, delay: 1.2 }}
                    className="absolute -top-3 -right-3 w-6 h-6 bg-void border-2 border-brand-mint rounded-full flex items-center justify-center shadow-lg"
                  >
                    <Check className="w-3 h-3 text-brand-mint" strokeWidth={3} />
                  </motion.div>
                )}
              </motion.div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}



