// Solo datos sintéticos. Nunca se persisten números de tarjeta ni códigos de seguridad.
export const DECLINED_TEST_CARD = "4000000000000002";
export const PAYMENT_DECLINED_MESSAGE = "Pago rechazado por el simulador. La reserva sigue pendiente de pago; probá otra tarjeta de prueba.";

export function simulatedPaymentResult(cardNumber?: string) {
  const declined = String(cardNumber ?? "").replace(/[^0-9]/g, "") === DECLINED_TEST_CARD;
  return { status: declined ? "RECHAZADO" : "Aprobado (simulado)", approved: !declined };
}
