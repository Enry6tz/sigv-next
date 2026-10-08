import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDocument, normalizeEmail, documentProblem, emailProblem, phoneProblem, passwordProblem, signupProblems } from "../src/lib/identity-validation.ts";

test("normaliza documentos con puntos, espacios o guiones", () => {
  assert.equal(normalizeDocument(" 12.345.678 "), "12345678");
  assert.equal(normalizeDocument("12-345-678"), "12345678");
  assert.equal(normalizeDocument(" 30111222"), "30111222");
});

test("exige documentos numéricos de 6 a 8 dígitos", () => {
  assert.match(documentProblem(""), /Ingresá el documento/);
  assert.match(documentProblem("   "), /Ingresá el documento/);
  assert.match(documentProblem("12.345"), /entre 6 y 8 dígitos/);
  assert.match(documentProblem("QA-FLOW-1"), /entre 6 y 8 dígitos/);
  assert.match(documentProblem("123456789"), /entre 6 y 8 dígitos/);
  assert.equal(documentProblem("30.111.222"), null);
  assert.equal(documentProblem("30111222"), null);
});

test("normaliza y exige correos válidos", () => {
  assert.equal(normalizeEmail("  Pasajero@Test.com "), "pasajero@test.com");
  assert.match(emailProblem(""), /Ingresá el correo/);
  assert.match(emailProblem("casi-correo"), /válido/);
  assert.match(emailProblem("a@b"), /válido/);
  assert.equal(emailProblem("pasajero@test.com"), null);
});

test("teléfono opcional pero con formato cuando viene", () => {
  assert.equal(phoneProblem(""), null);
  assert.equal(phoneProblem("   "), null);
  assert.match(phoneProblem("abc"), /teléfono/);
  assert.match(phoneProblem("12"), /teléfono/);
  assert.equal(phoneProblem("+54 9 11 5555-5555"), null);
});

test("contraseña de al menos 8 caracteres con letras y números", () => {
  assert.equal(passwordProblem("corta1").ok, false);
  assert.equal(passwordProblem("sololetras").ok, false);
  assert.equal(passwordProblem("12345678").ok, false);
  assert.equal(passwordProblem("viajes2026").ok, true);
});

test("signupProblems combina todas las reglas", () => {
  const base = { firstName: "Ana", lastName: "Prueba", document: "30111222", phone: "", email: "ana@test.com", password: "viajes2026", passwordAgain: "viajes2026" };
  assert.equal(signupProblems(base), null);
  assert.match(signupProblems({ ...base, document: "abc" }), /documento/);
  assert.match(signupProblems({ ...base, email: "mal" }), /correo/);
  assert.match(signupProblems({ ...base, password: "vieja", passwordAgain: "vieja" }), /8 caracteres/);
  assert.match(signupProblems({ ...base, passwordAgain: "distinta1" }), /no coinciden/);
  assert.match(signupProblems({ ...base, firstName: " " }), /nombre/);
});
