import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Carpetz — Logomat Simulator",
  description:
    "Simulator voor logomatten (binnen/buiten, kader, maat, kleur, logo upload en preview)."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
