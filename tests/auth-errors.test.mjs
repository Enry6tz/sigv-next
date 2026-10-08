import test from "node:test";
import assert from "node:assert/strict";
import { mapAuthError, describeAuthCallbackError } from "../src/lib/auth-errors.ts";

test("traduce errores de autenticación a mensajes en español", () => {
  assert.match(mapAuthError(Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" })), /correo o la contraseña/);
  assert.match(mapAuthError(Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" })), /aún no está confirmado/);
  assert.match(mapAuthError(Object.assign(new Error("User already registered"), { code: "user_already_exists" })), /Ya existe una cuenta/);
  assert.match(mapAuthError(Object.assign(new Error("Email rate limit exceeded"), { code: "over_email_send_rate_limit" })), /demasiados correos/);
  assert.match(mapAuthError(Object.assign(new Error("Database error saving new user"), { code: "database_error" })), /ya podrían estar registrados/);
  assert.match(mapAuthError(new Error("Something unexpected")), /No se pudo completar la operación/);
  assert.match(mapAuthError("no es un error"), /No se pudo completar la operación/);
});

test("describe el motivo de fallo del callback", () => {
  assert.equal(describeAuthCallbackError(new URLSearchParams()), null);
  assert.match(describeAuthCallbackError(new URLSearchParams("error_code=otp_expired")), /expiró o ya fue usado/);
  assert.match(describeAuthCallbackError(new URLSearchParams("error=access_denied&error_description=Email+link+is+invalid+or+has+expired")), /expiró o ya fue usado/);
  assert.match(describeAuthCallbackError(new URLSearchParams("error=confirmacion")), /No se pudo confirmar el correo/);
});
