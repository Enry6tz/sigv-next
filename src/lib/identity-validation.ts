// Reglas de validación de identidad compartidas por el formulario de registro,
// el perfil, la reserva y la capa API (mock y supabase). Un solo criterio en todas partes.

const DOCUMENT_PATTERN = /^[0-9]{6,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED = /^[0-9+\s()\-]{6,20}$/;
const PHONE_DIGITS = /[0-9]/g;

export function normalizeDocument(value: string): string {
  return value.trim().replace(/[\s.-]/g, "");
}

export function documentProblem(value: string): string | null {
  const document = normalizeDocument(value);
  if (!document) return "Ingresá el documento del pasajero.";
  if (!DOCUMENT_PATTERN.test(document)) return "El documento debe tener entre 6 y 8 dígitos, sin letras ni espacios.";
  return null;
}

export function normalizePhone(value: string): string {
  return value.trim();
}

export function phoneProblem(value: string): string | null {
  const phone = normalizePhone(value);
  if (!phone) return null; // el teléfono es opcional
  if (!PHONE_ALLOWED.test(phone) || (phone.match(PHONE_DIGITS)?.length ?? 0) < 6) {
    return "El teléfono debe tener entre 6 y 15 dígitos. Se admiten espacios, paréntesis, guiones y el prefijo +.";
  }
  return null;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailProblem(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return "Ingresá el correo electrónico.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Ingresá un correo electrónico válido.";
  return null;
}

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function passwordProblem(value: string): PasswordCheck {
  if (value.length < 8) return { ok: false, message: "La contraseña debe tener al menos 8 caracteres." };
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return { ok: false, message: "La contraseña debe combinar letras y números." };
  }
  return { ok: true };
}

export function signupProblems(fields: { firstName: string; lastName: string; document: string; phone: string; email: string; password: string; passwordAgain?: string }): string | null {
  if (!fields.firstName.trim() || !fields.lastName.trim()) return "Completá nombre y apellido.";
  const password = passwordProblem(fields.password);
  if (!password.ok) return password.message;
  if (fields.passwordAgain !== undefined && fields.passwordAgain !== fields.password) {
    return "Las contraseñas no coinciden.";
  }
  return documentProblem(fields.document) ?? emailProblem(fields.email) ?? phoneProblem(fields.phone);
}
