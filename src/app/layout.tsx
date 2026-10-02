import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIGV · Aerolínea nacional",
  description: "Prototipo Next.js de gestión de vuelos y pasajes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body>{children}</body></html>;
}
