import Link from "next/link";
import Image from "next/image";
import { SITE_COPY } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="divider-gradient-top py-12 lg:py-16">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-1 flex flex-col items-start gap-4">
          <Link href="#top" className="flex items-center focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded">
            <div className="relative w-96 h-28 opacity-85 hover:opacity-100 transition-opacity">
              <Image
                src="/assets/logo.png"
                alt="AI5K Logo"
                fill
                className="object-contain object-left"
              />
            </div>
          </Link>
          <p className="text-sm text-fog max-w-xs">{SITE_COPY.footer.tagline}</p>
        </div>

        <div>
          <h4 className="text-white font-medium mb-4 text-sm uppercase tracking-wide">Platform</h4>
          <ul className="space-y-3">
            {SITE_COPY.footer.links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-fog hover:text-brand-cyan transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded px-1 -ml-1"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-medium mb-4 text-sm uppercase tracking-wide">Legal</h4>
          <ul className="space-y-3">
            {SITE_COPY.footer.legalLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-fog hover:text-brand-cyan transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded px-1 -ml-1"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="flex flex-col justify-end">
          <p className="text-xs text-fog">© {new Date().getFullYear()} AI5K</p>
        </div>
      </div>
    </footer>
  );
}

