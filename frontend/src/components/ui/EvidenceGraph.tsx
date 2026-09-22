"use client";

import { ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export default function EvidenceGraph() {
  const shouldReduceMotion = useReducedMotion();
  
  // High-end smooth spring physics
  const springConfig = shouldReduceMotion 
    ? { duration: 0 } 
    : { type: "spring" as const, stiffness: 60, damping: 15, mass: 1 };
    
  const lineConfig = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 1.5, ease: "easeOut" as const }; // Custom cubic-bezier for smooth drawing

  const pulseTransition = shouldReduceMotion 
    ? { duration: 0 } 
    : { duration: 3, repeat: Infinity, ease: "easeInOut" as const, delay: 1.2 };

  return (
    <div className="relative w-full max-w-lg mx-auto aspect-square" aria-label="Abstract evidence graph showing progression to a verified node" role="img">
      <svg
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="edge-gradient" x1="0" y1="0" x2="400" y2="400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C488FB" />
            <stop offset="50%" stopColor="#5B98F7" />
            <stop offset="100%" stopColor="#21FEA9" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* --- EDGES --- */}
        <motion.path 
          initial={{ pathLength: 0, opacity: 0 }} 
          animate={{ pathLength: 1, opacity: 0.5 }} 
          transition={{ ...lineConfig, delay: 0.1 }}
          d="M60 280 L160 220" stroke="#3C4A66" strokeWidth="2" strokeDasharray="4 4" 
        />
        <motion.path 
          initial={{ pathLength: 0, opacity: 0 }} 
          animate={{ pathLength: 1, opacity: 0.6 }} 
          transition={{ ...lineConfig, delay: 0.3 }}
          d="M80 140 L160 220" stroke="#55698F" strokeWidth="2" 
        />
        <motion.path 
          initial={{ pathLength: 0, opacity: 0 }} 
          animate={{ pathLength: 1, opacity: 0.8 }} 
          transition={{ ...lineConfig, delay: 0.5 }}
          d="M160 220 L250 150" stroke="#7A6BB0" strokeWidth="2" 
        />
        <motion.path 
          initial={{ pathLength: 0, opacity: 0 }} 
          animate={{ pathLength: 1, opacity: 0.6 }} 
          transition={{ ...lineConfig, delay: 0.6 }}
          d="M320 260 L250 150" stroke="#2E7FC4" strokeWidth="2" strokeDasharray="4 4" 
        />
        <motion.path 
          initial={{ pathLength: 0, opacity: 0 }} 
          animate={{ pathLength: 1, opacity: 1 }} 
          transition={{ ...lineConfig, delay: 0.8 }}
          d="M250 150 L200 80" stroke="url(#edge-gradient)" strokeWidth="3" 
        />

        {/* --- ANIMATED DATA PACKETS (Running along lines) --- */}
        {!shouldReduceMotion && (
          <g>
            <motion.circle cx="60" cy="280" r="3" fill="#5B98F7" filter="url(#glow)">
              <animateMotion dur="3s" repeatCount="indefinite" path="M0 0 L100 -60" />
            </motion.circle>
            <motion.circle cx="80" cy="140" r="3" fill="#C488FB" filter="url(#glow)">
              <animateMotion dur="2.5s" repeatCount="indefinite" path="M0 0 L80 80" />
            </motion.circle>
            <motion.circle cx="160" cy="220" r="4" fill="#21FEA9" filter="url(#glow)">
              <animateMotion dur="2s" repeatCount="indefinite" path="M0 0 L90 -70" />
            </motion.circle>
          </g>
        )}

        {/* --- NODES --- */}
        
        {/* Tier 1 Node */}
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springConfig, delay: 0.2 }} style={{ transformOrigin:"60px 280px" }}>
          <circle cx="60" cy="280" r="8" fill="#131218" stroke="#3C4A66" strokeWidth="3" />
        </motion.g>

        {/* Tier 2 Node */}
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springConfig, delay: 0.4 }} style={{ transformOrigin:"80px 140px" }}>
          <circle cx="80" cy="140" r="10" fill="#131218" stroke="#55698F" strokeWidth="3" />
        </motion.g>

        {/* Tier 4 Node */}
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springConfig, delay: 0.7 }} style={{ transformOrigin:"320px 260px" }}>
          <circle cx="320" cy="260" r="8" fill="#131218" stroke="#2E7FC4" strokeWidth="3" />
        </motion.g>
        
        {/* Intermediate verified-ish node (Tier 3) */}
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...springConfig, delay: 0.6 }} style={{ transformOrigin:"160px 220px" }}>
          <circle cx="160" cy="220" r="14" fill="#131218" stroke="#7A6BB0" strokeWidth="4" />
          <circle cx="160" cy="220" r="22" stroke="#7A6BB0" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="2 2" />
        </motion.g>

        {/* Almost there node (Tier 6) */}
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...springConfig, delay: 0.9 }} style={{ transformOrigin:"250px 150px" }}>
          <circle cx="250" cy="150" r="16" fill="#131218" stroke="#50DFFB" strokeWidth="4" />
          <circle cx="250" cy="150" r="26" stroke="#50DFFB" strokeWidth="1.5" strokeOpacity="0.6" />
          <circle cx="250" cy="150" r="34" stroke="#50DFFB" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="4 4" />
        </motion.g>

        {/* Terminal Gold Standard Node (Tier 7) */}
        <motion.g 
          initial={{ scale: 0.5, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          transition={{ ...springConfig, delay: 1.2 }}
          transform="translate(200, 80)"
        >
          {/* Outer glowing halo */}
          <motion.circle 
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={pulseTransition}
            cx="0" cy="0" r="45" stroke="#21FEA9" strokeWidth="1" fill="#21FEA9" fillOpacity="0.05"
          />
          <circle cx="0" cy="0" r="32" fill="url(#edge-gradient)" filter="url(#glow)" />
          <circle cx="0" cy="0" r="28" fill="#131218" />
        </motion.g>
      </svg>
      
      {/* HTML overlay for the checkmark to perfectly match UI */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.5, rotate: -15 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ ...springConfig, delay: 1.4 }}
        className="absolute left-[50%] top-[20%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
      >
        <ShieldCheck className="w-10 h-10 text-brand-mint relative z-10" strokeWidth={2} />
      </motion.div>

      {/* Floating UI Readouts */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...springConfig, delay: 1.6 }}
        className="absolute top-[32%] right-[2%] bg-void/90 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl shadow-brand-cyan/10 hidden sm:flex flex-col gap-1"
      >
        <p className="font-mono text-[10px] text-fog uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan animate-pulse"></span>
          Node 254
        </p>
        <p className="font-display text-sm font-medium text-white">Project Demonstrated</p>
        <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: "90%" }} transition={{ delay: 1.8, duration: 1 }} className="h-full bg-brand-cyan"></motion.div>
        </div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...springConfig, delay: 1.8 }}
        className="absolute top-[5%] left-[5%] bg-void/90 backdrop-blur-md border border-brand-mint/30 rounded-lg p-3 shadow-2xl shadow-brand-mint/20 hidden sm:flex flex-col gap-1"
      >
        <p className="font-mono text-[10px] text-brand-mint uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-3 h-3" />
          Verified Block
        </p>
        <p className="font-display text-sm font-bold text-white">Client-Verified (Tier 7)</p>
        <p className="font-mono text-[10px] text-fog">Score: 1.00 / Cryptographically Signed</p>
      </motion.div>
    </div>
  );
}





