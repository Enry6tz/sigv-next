// Traducción de los errores de Supabase Auth al español de la interfaz.
// Evita mostrar mensajes crudos en inglés ("Invalid login credentials", etc.).

type AuthErrorLike = { code?: string; status?: number; message?: string };

// Errores ya redactados en español por la interfaz: no deben pasar por el mapper.
export class LocalizedError extends Error {}

export function mapAuthError(reason: unknown): string {
  if (!(reason instanceof Error)) return "No se pudo completar la operación. Intentá nuevamente en unos minutos.";
  const error = reason as AuthErrorLike;
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "El correo o la contraseña no son correctos. Revisá los datos e intentá de nuevo.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Tu correo aún no está confirmado. Revisá tu casilla y abrí el enlace de confirmación.";
  }
  if (code === "user_already_exists" || /user already registered/i.test(message)) {
    return "Ya existe una cuenta con ese correo. Ingresá o usá otro correo.";
  }
  if (code === "weak_password" || /password should be at least/i.test(message)) {
    return "La contraseña es demasiado débil. Usá al menos 8 caracteres con letras y números.";
  }
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(message)) {
    return "Se enviaron demasiados correos en poco tiempo. Esperá unos minutos y volvé a intentar.";
  }
  if (code === "signup_disabled" || /signups not allowed/i.test(message)) {
    return "El registro de cuentas está deshabilitado en este entorno.";
  }
  if (code === "email_invalid" || /email address .* is invalid/i.test(message)) {
    return "El correo electrónico no es válido.";
  }
  if (code === "user_not_found" || /user not found/i.test(message)) {
    return "No encontramos una cuenta con ese correo.";
  }
  if (code === "same_email" || /same email/i.test(message)) {
    return "Ese ya es tu correo actual.";
  }
  if (code === "session_not_found" || /session expired/i.test(message)) {
    return "Tu sesión expiró. Ingresá nuevamente para continuar.";
  }
  if (code === "database_error" || /database error saving new user/i.test(message)) {
    return "No se pudo crear la cuenta: el correo o el documento ya podrían estar registrados. Si es así, iniciá sesión o usá otro dato.";
  }
  if (code === "provider_email_needs_confirmation") {
    return "El proveedor de acceso no confirmó el correo. Intentá de nuevo o contactá al administrador.";
  }
  if (/failed to fetch|network/i.test(message)) {
    return "No hay conexión con el servicio de acceso. Revisá tu internet y volvé a intentar.";
  }
  return "No se pudo completar la operación. Intentá nuevamente en unos minutos.";
}

// Errores que el enlace de confirmación deja en la URL del callback cuando
// el enlace expiró, ya fue usado o el usuario lo rechazó.
export function describeAuthCallbackError(query: URLSearchParams): string | null {
  const code = query.get("error_code") ?? query.get("error") ?? "";
  const description = query.get("error_description") ?? "";
  if (!code && !description) return null;
  if (/otp_expired|expired|access_denied/i.test(code) || /expired/i.test(description)) {
    return "El enlace de confirmación expiró o ya fue usado. Pedí uno nuevo desde el inicio de sesión.";
  }
  if (/session_exists/i.test(code)) return "La sesión ya estaba confirmada. Ingresá con tu correo y contraseña.";
  return "No se pudo confirmar el correo. Probá ingresar o solicitar otro enlace.";
}
