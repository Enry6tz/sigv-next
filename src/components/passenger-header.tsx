"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { findModule } from "@/lib/catalog";
import { SignOutButton } from "./supabase-auth-form";

export function PassengerHeader({ signedIn, sprint }: { signedIn: boolean; sprint: number }) {
  const reservationsEnabled = sprint >= findModule("pasajero", "mis-reservas")!.sprint;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [{ href: "/pasajero/buscar-vuelos", label: "Buscar vuelos", active: pathname === "/" || pathname === "/pasajero/buscar-vuelos" },
    ...(reservationsEnabled ? [{ href: "/pasajero/mis-reservas", label: "Mis reservas", active: pathname === "/pasajero/mis-reservas" }] : [])];
  return <><header className="passenger-header">
    <Link href="/" className="brand"><span className="brand-mark">✈</span><span><strong>SIGV</strong><small>AEROLÍNEA NACIONAL</small></span></Link>
    <nav className="passenger-navigation" aria-label="Navegación de pasajeros">
      {links.map((link) => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined}>{link.label}</Link>)}
      <span aria-disabled="true" title="Próximamente">Check-in Online</span>
      <Link href="/pasajero/buscar-vuelos">Info de vuelo</Link>
    </nav>
    <div className="passenger-account">{signedIn ? <><Link href="/pasajero/perfil" className="button small">Mi perfil</Link><SignOutButton /></> : <><Link href="/ingresar" className="button small">Iniciar sesión</Link><Link href="/registro" className="button dark small">Registrarse</Link></>}</div>
    <button className="passenger-menu-toggle" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="passenger-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "×" : "☰"}</button>
  </header>
    {menuOpen && <nav id="passenger-mobile-menu" className="passenger-mobile-menu" aria-label="Menú del pasajero" onClick={() => setMenuOpen(false)}>
      <Link href="/pasajero/buscar-vuelos">Buscar vuelos</Link>{reservationsEnabled && <><Link href="/pasajero/mis-reservas">Mis reservas</Link><Link href="/pasajero/facturas">Facturas</Link></>}{sprint >= 3 && <><Link href="/pasajero/tickets">Tickets digitales</Link><Link href="/pasajero/notificaciones">Notificaciones</Link></>}
      {signedIn ? <><Link href="/pasajero/perfil">Mi perfil</Link><SignOutButton /></> : <><Link href="/ingresar">Iniciar sesión</Link><Link href="/registro">Registrarse</Link></>}
    </nav>}
    <nav className="passenger-bottom-nav" aria-label="Navegación móvil">
      <Link href="/pasajero/buscar-vuelos" aria-current={pathname === "/" || pathname === "/pasajero/buscar-vuelos" ? "page" : undefined}><span aria-hidden="true">✈️</span>Buscar</Link>
      {reservationsEnabled && <Link href="/pasajero/mis-reservas" aria-current={pathname === "/pasajero/mis-reservas" ? "page" : undefined}><span aria-hidden="true">📋</span>Reservas</Link>}
      <Link href="/pasajero/perfil" aria-current={pathname === "/pasajero/perfil" ? "page" : undefined}><span aria-hidden="true">👤</span>Perfil</Link><button type="button" aria-expanded={menuOpen} aria-controls="passenger-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true">⚙️</span>Más</button>
    </nav>
  </>;
}
