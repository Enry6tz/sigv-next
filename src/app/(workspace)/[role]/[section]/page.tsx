import { notFound, redirect } from "next/navigation";
import { canAccess, findModule, isRole } from "@/lib/catalog";
import { appSprint, dataProvider } from "@/lib/sprint";
import { ModuleContent } from "@/components/module-content";
import { createClient } from "@/lib/supabase/server";
import { PassengerSearch } from "@/components/passenger-search";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params, searchParams }: { params: Promise<{ role: string; section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role, section } = await params;
  if (!isRole(role)) notFound();
  if (!canAccess(role, section, appSprint)) notFound();
  const sectionModule = findModule(role, section)!;
  if (role === "pasajero" && section === "inicio") redirect("/pasajero/buscar-vuelos");
  const query = await searchParams;
  if (dataProvider === "supabase" && role === "pasajero" && !["inicio", "buscar-vuelos"].includes(section)) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      const retained = new URLSearchParams();
      for (const [name, value] of Object.entries(query)) if (typeof value === "string") retained.set(name, value);
      redirect(`/ingresar?${new URLSearchParams({ next: `/pasajero/${section}${retained.size ? `?${retained}` : ""}` })}`);
    }
  }
  const initialFlight = typeof query.flight === "string" ? query.flight : undefined;
  const initialQuery = {
    origin: typeof query.origin === "string" ? query.origin : "",
    destination: typeof query.destination === "string" ? query.destination : "",
    date: typeof query.date === "string" ? query.date : "",
    reservation: typeof query.reservation === "string" ? query.reservation : "",
    returnReservation: typeof query.returnReservation === "string" ? query.returnReservation : "",
    passengers: typeof query.passengers === "string" ? query.passengers : "1",
    cabin: query.cabin === "Primera" ? "Primera" : query.cabin === "Economy" ? "Economy" : "",
    returnFlight: typeof query.returnFlight === "string" ? query.returnFlight : "",
    returnCabin: query.returnCabin === "Primera" ? "Primera" : "Economy",
    returnDate: typeof query.returnDate === "string" ? query.returnDate : "",
    trip: query.trip === "one-way" || (query.date && !query.returnDate) ? "one-way" : "round-trip",
  };
  if (role === "pasajero" && section === "buscar-vuelos") return <PassengerSearch key={JSON.stringify(initialQuery)} initialQuery={initialQuery} sprint={appSprint} />;
  return <>
    {role === "admin" && section === "vuelos" ? <h1 className="sr-only">Listado de vuelos</h1> : <div className="page-heading"><div>{role !== "pasajero" && <p className="kicker">{role.toUpperCase()} / {sectionModule.rf}</p>}<h1>{sectionModule.label}</h1><p>{sectionModule.description}</p></div>{role !== "pasajero" && sectionModule.us !== "—" && <span className="page-us">{sectionModule.us}</span>}</div>}
    <ModuleContent module={sectionModule} sprint={appSprint} initialFlight={initialFlight} initialQuery={initialQuery} live={dataProvider === "supabase"} />
  </>;
}
