import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "AI5K - Verified AI capability for global work",
  description: "AI5K is a verified global AI capability network. Every skill claim carries an evidence tier, from self-declared to client-verified delivery.",
  openGraph: {
    images: [
      {
        url: "/assets/logo.png",
        width: 1200,
        height: 630,
        alt: "AI5K - Verified AI capability for global work",
      }
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&family=Space+Grotesk:wght@500;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="font-sans">
        <AuthProvider>
          <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["Organization", "SoftwareApplication"],
              "name": "AI5K",
              "description": "AI5K is a verified global AI capability network. Every skill claim carries an evidence tier, from self-declared to client-verified delivery.",
              "url": "https://ai5k.com",
              "applicationCategory": "BusinessApplication"
            })
          }}
        />
        {children}
        </AuthProvider>
      </body>
    </html>
  );
}




