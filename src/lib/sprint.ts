import "server-only";

const parsed = Number(process.env.APP_SPRINT ?? "1");
if (![1, 2, 3].includes(parsed)) {
  throw new Error("APP_SPRINT debe ser 1, 2 o 3");
}

export const appSprint = parsed as 1 | 2 | 3;
export const dataProvider = process.env.DATA_PROVIDER ?? "mock";
if (dataProvider !== "mock" && dataProvider !== "supabase") {
  throw new Error("DATA_PROVIDER debe ser mock o supabase");
}

export function available(minSprint: number) {
  return appSprint >= minSprint;
}

// Zona horaria para mostrar fechas generadas en el servidor (comprobantes, auditoría).
export const appTimeZone = process.env.APP_TIME_ZONE || "America/Argentina/Buenos_Aires";
