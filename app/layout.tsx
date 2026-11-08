import { Suspense } from "react";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: { default: "BD Tech Radar — Tech jobs in Bangladesh", template: "%s · BD Tech Radar" },
  description: "Government and private technology jobs in Bangladesh, organized in one searchable place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}>
      <body>
        <AuthProvider>
          <a href="#main" className="sr-only">
            Skip to content
          </a>
          {/* usePathname needs a Suspense boundary on dynamic routes under Cache Components */}
          <Suspense fallback={<div style={{ height: "var(--header-h)", borderBottom: "1px solid var(--line)" }} />}>
            <Header />
          </Suspense>
          <main id="main" style={{ flex: 1 }}>
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
