import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isRole, roleLabels, roleModules } from "@/lib/catalog";
import { appSprint, dataProvider } from "@/lib/sprint";
import { SidebarNav } from "@/components/sidebar-nav";
import { SignOutButton } from "@/components/supabase-auth-form";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { PassengerHeader } from "@/components/passenger-header";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const live = dataProvider === "supabase";
  let signedIn = false;
  let userName = "Administrador";
  if (live) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
    if (role === "admin" || role === "mostrador") {
      if (!signedIn) redirect(`/ingresar?next=/${role}/inicio`);
      const { data: actualRole } = await supabase.rpc("sigv_role");
      if (actualRole !== role && !(role === "mostrador" && actualRole === "admin")) redirect("/pasajero/inicio");
      if (role === "admin") {
        const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", data!.claims!.sub).single();
        userName = profile?.name || userName;
      }
    }
  }
  const items = roleModules(role, appSprint).filter((item) => !live || signedIn || ["inicio", "buscar-vuelos"].includes(item.slug));
  const normal = <div className="workspace">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">✈</span><span><strong>SIGV</strong><small>AEROLÍNEA NACIONAL</small></span></Link>
      <div className="sidebar-group"><p className="side-caption">{roleLabels[role]}</p><SidebarNav role={role} items={items} /></div>
      <div className="sidebar-bottom"><span className="demo-dot" /> {live ? "Supabase conectado" : "Modo demostración"}<br /><small>Sprint {appSprint} · {live ? "datos en línea" : "datos simulados"}</small></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-header"><Link className="mobile-brand" href="/">✈ SIGV</Link><div><span className="header-overline">SIGV / {roleLabels[role]}</span><strong>Panel {roleLabels[role].toLowerCase()}</strong></div><div className="header-right"><span className="pill">SPRINT {appSprint}</span>{live ? signedIn ? <SignOutButton /> : <Link href="/ingresar" className="header-exit">Iniciar sesión</Link> : <Link href="/" className="header-exit">Salir de la demo</Link>}</div></header>
      <div className="mobile-nav"><SidebarNav role={role} items={items} /></div>
      <main className="workspace-content">{children}</main>
    </div>
  </div>;
  return <WorkspaceFrame normal={normal} name={userName} live={live} role={role} items={items} passengerHeader={<PassengerHeader signedIn={signedIn} sprint={appSprint} live={live} />}>{children}</WorkspaceFrame>;
}
