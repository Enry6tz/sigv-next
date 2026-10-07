export function safeNextPath(value?: string | null) {
  return value && /^\/(pasajero|admin|mostrador)(\/|$)/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : undefined;
}
