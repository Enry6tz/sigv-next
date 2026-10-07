"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Module, Role } from "@/lib/catalog";
import { SignOutButton } from "./supabase-auth-form";

export function WorkspaceFrame({ normal, children, name, live, role, items, passengerHeader }: { normal: ReactNode; children: ReactNode; name: string; live: boolean; role: Role; items: Module[]; passengerHeader?: ReactNode }) {
  const pathname = usePathname();
  if (role === "pasajero") return <>{passengerHeader}<main className={pathname === "/pasajero/buscar-vuelos" ? undefined : "passenger-container passenger-workspace-content"}>{children}</main></>;
  if (role !== "admin") return normal;
  return <div className="admin-flights-workspace"><header className="admin-flights-header">
    <div><Link href="/admin/vuelos" className="admin-flights-brand"><span>AN</span>SIGV</Link><span className="admin-flights-header-title">Panel Administrativo</span></div>
    <div className="admin-flights-account"><span className="admin-flights-avatar" aria-hidden="true">{name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span>{name}<small>Admin. Operativo</small></span>{live ? <SignOutButton /> : <Link href="/" className="header-exit">Salir de la demo</Link>}</div>
  </header>
    <nav className="admin-navigation" aria-label="Navegación de administración">
      {items.filter((item) => ["vuelos", "capacidades", "tarifas", "reportes"].includes(item.slug)).map((item) => {
        const href = `/admin/${item.slug}`;
        return <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{item.label}</Link>;
      })}
    </nav>
    <main className={pathname === "/admin/vuelos" ? undefined : "admin-workspace-content"}>{children}</main>
  </div>;
}
