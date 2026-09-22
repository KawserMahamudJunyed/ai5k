# AI5K: Verified AI Capability Platform

The enterprise platform for discovering and verifying AI engineering, legal, and financial talent. AI5K eliminates guesswork by demanding explicit, verifiable evidence for every claimed capability—from self-declared benchmarks to client-verified delivery.

## ?? Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS v3
- **Animations:** Framer Motion (custom spring physics)
- **Icons:** Lucide React
- **Language:** TypeScript

## ?? Local Development

To run the platform locally on your machine, simply clone the repository, install dependencies, and spin up the development server:

\\\ash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev
\\\

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## ?? Production Deployment (Vercel)

This repository is strictly configured for **Zero-Config Vercel Deployment**.

1. Import this repository into Vercel.
2. Ensure the **Framework Preset** is set to **Next.js**.
3. Vercel will automatically detect the build settings, ignore \
ode_modules\, and generate the optimized production build.

**Note:** The \package-lock.json\ is intentionally omitted from source control to allow Vercel's Linux environments to cleanly resolve OS-specific binary packages (e.g., SWC compiler binaries) without cross-platform conflicts.

## ??? Brand & Design Guidelines

This project rigorously adheres to the official AI5K Design System:
- **70/20/10 Rule:** 70% void/navy backgrounds, 20% text/surfaces, =10% brand accent colors.
- **Strict Evidence Policy:** No builder capabilities are rendered without a verified tier badge.
- **Accessibility First:** Full support for \prefers-reduced-motion\ and comprehensive ARIA labeling.

## ?? License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## ?? Project Roadmap (Status)

### ? Completed (Phase 1 - Frontend Foundation)
- [x] **Brand & UI System:** Fully implemented AI5K dark-mode design system with strict 70/20/10 color rules.
- [x] **Landing Page:** Responsive hero, capability filters, and interactive Verification Ladder.
- [x] **Builder Profiles (\/builder/[id]\):** Dynamic profile pages mapping capabilities to strict verification tiers.
- [x] **Enterprise Animations:** Custom spring-physics hover states, SplitPanel glow, and focus ring snaps.
- [x] **Infrastructure:** Custom 404 boundaries, 500 error boundaries, and global loading slide-loaders.
- [x] **Performance:** Passes Lighthouse with high accessibility/SEO scores and reduced-motion support.

### ?? Up Next (Phase 2 - Data & Auth)
- [ ] **Database Integration:** Connect Next.js frontend to a real backend (e.g., Supabase, PostgreSQL) to replace mock data.
- [ ] **Builder Onboarding Flow:** Secure registration forms for AI experts to submit credentials and capability evidence.
- [ ] **Search & Discovery Directory:** Advanced filtering for clients to find builders based on specific AI capabilities and verification tiers.
- [ ] **Metadata Assets:** Upload final \og-image.jpg\ for optimized social media link sharing.


