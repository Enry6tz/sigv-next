# Recursos y contratos

/api/data/{resource} y su alias /api/mock/{resource} aceptan los métodos indicados abajo. Con DATA_PROVIDER=supabase, las respuestas usan el SDK de Supabase, sesión, RLS y RPC. Las escrituras devuelven persisted: true; con DATA_PROVIDER=mock devuelven persisted: false y no modifican datos. Un recurso posterior a APP_SPRINT responde 404 con code: SPRINT_DISABLED antes de consultar la base.

| Sprint | Recursos | Escrituras disponibles con Supabase |
| --- | --- | --- |
| S1 | dashboard, flights, airports, aircraft, schedules, frequencies, configurations, capacities, fares, users, profile, auth | Vuelos, catálogos, programaciones, frecuencias y configuraciones; cupos y tarifas; roles y perfil. Archivo/restauración lógica donde aplica. |
| S2 | reservations, payments, invoices, receipts, disruptions, manifest, check-in, boarding-passes, seats | Reserva y cancelación; pago simulado; reenvío de comprobantes por correo; reprogramación; check-in; bloquear/liberar asientos. Comprobantes, manifiesto y pases se consultan. |
| S3 | notifications, tickets, reports, flight-logs | Marcar aviso como leído. Tickets, reportes y auditoría son consultas. |

GET /api/data/flights acepta origin, destination y date. GET /api/data/seats acepta flightId. El pasajero solo puede leer sus reservas, pagos, comprobantes y avisos; administración y mostrador tienen permisos diferenciados. Las RPC validan cupos, clase, documento, asiento y estado de la reserva dentro de la base. GET /api/health muestra sprint y proveedor sin revelar credenciales.

POST /api/data/payments confirma el pago y, desde Sprint 2 y con SMTP configurado, programa el envío del e-ticket de cada pasajero y la factura en PDF al correo de contacto de la reserva; la respuesta incluye receiptEmail con ese destinatario o null. POST /api/data/receipts con reservationCode reenvía esos comprobantes de una reserva confirmada propia. GET /api/receipts/{reserva}?doc=factura y ?doc=eticket&passenger={id} descargan los mismos PDF; solo el titular de la reserva puede obtenerlos.

Recurso desconocido: 404; método no admitido: 405; petición inválida: 400; falta de sesión o rol: 401/403 según la operación. Las políticas RLS son la última barrera de acceso.
