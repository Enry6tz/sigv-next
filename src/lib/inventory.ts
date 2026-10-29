export type FlightInventory = { capacityEconomy: number; capacityFirst: number; seatsEconomy: number; seatsFirst: number };

export function summarizeInventory(row: FlightInventory, assignedEconomy = 0, assignedFirst = 0) {
  const soldEconomy = row.capacityEconomy - row.seatsEconomy;
  const soldFirst = row.capacityFirst - row.seatsFirst;
  return { soldEconomy, soldFirst, soldTotal: soldEconomy + soldFirst, assignedEconomy, assignedFirst };
}
