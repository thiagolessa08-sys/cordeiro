import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Painel Comercial · Cordeiro",
  description: "Dashboard SAP Business One — Grupo Melo Cordeiro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
