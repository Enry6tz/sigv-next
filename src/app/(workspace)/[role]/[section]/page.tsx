import { notFound, redirect } from "next/navigation";
import { findModule, isRole } from "@/lib/catalog";
import { appSprint, dataProvider } from "@/lib/sprint";
import { ModuleContent } from "@/components/module-content";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params, searchParams }: { params: Promise<{ role: string; section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role, section } = await params;
  if (!isRole(role)) notFound();
  const sectionModule = findModule(role, section);
  if (!sectionModule || sectionModule.sprint > appSprint) notFound();
  if (dataProvider === "supabase" && role === "pasajero" && !["inicio", "buscar-vuelos"].includes(section)) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) redirect(`/ingresar?next=/pasajero/${section}`);
  }
  const query = await searchParams;
  const initialFlight = typeof query.flight === "string" ? query.flight : undefined;
  const initialQuery = {
    origin: typeof query.origin === "string" ? query.origin : "",
    destination: typeof query.destination === "string" ? query.destination : "",
    date: typeof query.date === "string" ? query.date : "",
    reservation: typeof query.reservation === "string" ? query.reservation : "",
  };
  return <>
    <div className="page-heading"><div><p className="kicker">{role.toUpperCase()} / {sectionModule.rf}</p><h1>{sectionModule.label}</h1><p>{sectionModule.description}</p></div>{sectionModule.us !== "—" && <span className="page-us">{sectionModule.us}</span>}</div>
    <ModuleContent module={sectionModule} sprint={appSprint} initialFlight={initialFlight} initialQuery={initialQuery} live={dataProvider === "supabase"} />
  </>;
}
