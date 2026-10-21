import QRCode from "qrcode";

// Mismo identificador que devuelve sigv_check_in: "BP-" y los primeros 10 hex del pasajero.
export function boardingPassCode(passengerId: string) {
  return `BP-${passengerId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

// Contenido del QR del pase: identificador del pase y los datos que valida la puerta
// de embarque (reserva, vuelo, fecha y asiento), separados por "|".
export function boardingPassPayload(pass: { code: string; reservationCode: string; flightCode: string; date: string; seat: string }) {
  return ["SIGV", pass.code, pass.reservationCode, pass.flightCode, pass.date, pass.seat].join("|");
}

// Matriz de módulos del QR (true = negro), sin margen. La usan la vista de mostrador y el PDF.
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, col) => Boolean(modules.get(row, col))));
}
