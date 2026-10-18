// Validación de la pasarela de pago simulada (US-017). El mismo criterio se
// aplica en el cliente y en la API: un mensaje claro junto al campo afectado y
// la reserva se mantiene sin confirmar cuando algo no cumple el formato.

const CARD_NUMBER_PATTERN = /^[0-9]{16}$/;
const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
const CVV_PATTERN = /^[0-9]{3,4}$/;
const HOLDER_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;

export function normalizeCardNumber(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 16);
}

// Número agrupado en bloques de cuatro, como lo muestra el wireframe.
export function groupCardNumber(value: string): string {
  return normalizeCardNumber(value).replace(/(.{4})/g, "$1 ").trim();
}

// Vencimiento con barra automática: “1028” se muestra como “10/28”.
export function formatCardExpiry(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function normalizeCardCvv(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 4);
}

export function cardNumberProblem(value: string): string | null {
  const digits = normalizeCardNumber(value);
  if (!digits) return "Ingresá el número de tarjeta.";
  if (!CARD_NUMBER_PATTERN.test(digits)) return "Formato de número de tarjeta inválido, debe ser 16 dígitos.";
  return null;
}

export function cardHolderProblem(value: string): string | null {
  const holder = value.trim();
  if (!holder) return "Ingresá el nombre como figura en la tarjeta.";
  if (!HOLDER_PATTERN.test(holder)) return "Formato de titular inválido, debe contener solo letras y espacios.";
  return null;
}

export function cardExpiryProblem(value: string): string | null {
  const expiry = formatCardExpiry(value);
  const match = EXPIRY_PATTERN.exec(expiry);
  if (!match) return "Formato de vencimiento inválido, debe ser MM/AA.";
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const current = new Date();
  if (year < current.getFullYear() || (year === current.getFullYear() && month < current.getMonth() + 1))
    return "La tarjeta ya venció. Usá un medio de pago vigente.";
  return null;
}

export function cardCvvProblem(value: string): string | null {
  const cvv = normalizeCardCvv(value);
  if (!cvv) return "Ingresá el código de seguridad.";
  if (!CVV_PATTERN.test(cvv)) return "Formato de CVV inválido, debe ser 3 o 4 dígitos.";
  return null;
}

// Devuelve el primer problema del conjunto completo del formulario.
export function cardFormProblem(payload: { cardNumber?: string; cardHolder?: string; cardExpiry?: string; cardCvv?: string }): string | null {
  return cardNumberProblem(String(payload.cardNumber ?? ""))
    ?? cardHolderProblem(String(payload.cardHolder ?? ""))
    ?? cardExpiryProblem(String(payload.cardExpiry ?? ""))
    ?? cardCvvProblem(String(payload.cardCvv ?? ""));
}
