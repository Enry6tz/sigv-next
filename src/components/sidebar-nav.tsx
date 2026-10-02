"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Module, Role } from "@/lib/catalog";

export function SidebarNav({ role, items }: { role: Role; items: Module[] }) {
  const pathname = usePathname();
  return <nav className="sidebar-nav" aria-label="Navegación principal">
    {items.map((item) => {
      const href = `/${role}/${item.slug}`;
      return <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><span className="nav-square" aria-hidden="true" />{item.label}</Link>;
    })}
  </nav>;
}
