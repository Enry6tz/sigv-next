const base = process.env.APP_BASE_URL ?? "http://localhost:3001";
const expectedSprint = Number(process.argv[2]);
if (![1, 2, 3].includes(expectedSprint)) throw new Error("Usar: npm run verify:profile -- 1|2|3");

const health = await (await fetch(`${base}/api/health`)).json();
if (health.sprint !== expectedSprint || !["mock", "supabase"].includes(health.provider))
  throw new Error(`Perfil inesperado: ${JSON.stringify(health)}`);

const cases = [
  ["dashboard", 1], ["flights", 1], ["airports", 1], ["aircraft", 1],
  ["schedules", 1], ["frequencies", 1], ["configurations", 1],
  ["capacities", 1], ["fares", 1], ["users", 1], ["profile", 1], ["auth", 1],
  ["reservations", 2], ["payments", 2], ["invoices", 2], ["disruptions", 2],
  ["manifest", 2], ["check-in", 2], ["boarding-passes", 2], ["seats", 2],
  ["notifications", 3], ["tickets", 3], ["reports", 3], ["flight-logs", 3],
];

for (const [resource, minSprint] of cases) {
  const response = await fetch(`${base}/api/data/${resource}`);
  const body = await response.json();
  if (expectedSprint < minSprint) {
    if (response.status !== 404 || body.code !== "SPRINT_DISABLED")
      throw new Error(`${resource}: faltó bloqueo de sprint (${response.status})`);
  } else if (response.status === 404 && body.code === "SPRINT_DISABLED") {
    throw new Error(`${resource}: se bloqueó un recurso del sprint actual`);
  } else if (resource === "flights" && response.status !== 200) {
    throw new Error(`La búsqueda pública de vuelos falló (${response.status})`);
  }
}

const futureRoutes = [
  ["/pasajero/compra", 2], ["/pasajero/facturas", 2],
  ["/pasajero/notificaciones", 3], ["/pasajero/tickets", 3],
];
for (const [route, minSprint] of futureRoutes) {
  if (expectedSprint >= minSprint) continue;
  const response = await fetch(`${base}${route}`, { redirect: "manual" });
  if (response.status !== 404) throw new Error(`${route}: HTTP ${response.status}, esperado 404`);
}

for (const route of ["/api/reports/occupancy/download", "/api/tickets/00000000-0000-0000-0000-000000000000/download"]) {
  const response = await fetch(`${base}${route}`, { redirect: "manual" });
  const expected = expectedSprint < 3 ? 404 : health.provider === "supabase" ? 401 : 404;
  if (response.status !== expected) throw new Error(`${route}: HTTP ${response.status}, esperado ${expected}`);
}

console.log(`Sprint ${expectedSprint}: ${cases.length} recursos y rutas futuras verificados con ${health.provider}.`);
