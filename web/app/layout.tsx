import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["500", "700", "800"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Heads Up",
  description: "See money surprises coming and get ready in time.",
};

export const viewport: Viewport = { themeColor: "#14213d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={`${display.variable} ${body.variable}`}>
        <AuthProvider>
          <div className="mx-auto min-h-dvh w-full max-w-[440px] bg-background shadow-[0_0_0_1px_var(--line)] sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:rounded-[28px] sm:overflow-hidden">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
