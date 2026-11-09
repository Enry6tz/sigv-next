# Cobertura funcional · SIGV

La asignación por sprint es editable: las fuentes SIGV no fijan una división aprobada de las 16 historias. APP_SPRINT aplica el corte en menús, rutas y API.

| Historias | Implementación actual |
| --- | --- |
| US-001 a US-005 | CRUD de vuelos, aeropuertos, aviones, programaciones, frecuencias, cupos y tarifas; reprogramación, cancelación, archivo, generación de vuelos y auditoría. |
| US-006 y US-007 | Búsqueda pública por ruta y fecha, horarios, disponibilidad y comparación de tarifas Economy/Primera. |
| US-008 a US-014 | Registro público de pasajero con datos personales, Supabase Auth, confirmación de correo habilitada, inicio/cierre de sesión, perfil editable con cambio de correo confirmado por enlace, roles protegidos por RLS y mensajes de error traducidos. El reenvío de confirmación está disponible desde el formulario. La entrega real del correo no se verificó con un buzón. |
| US-015 y US-016 | Reserva de 1 a 9 pasajes por clase, clase ajustable también desde la pantalla de compra, acompañantes identificados, documento numérico de 6 a 8 caracteres, un único pasaje por documento y vuelo, contacto del comprador obligatorio y cupos descontados en transacción. |
| US-025 a US-030 | Cola e historial de correos de contingencia con motivo opcional, reporte de ocupación filtrable con detalle de pasajes confirmados y flujo web adaptable a móvil con reconciliación ante caída de conexión. |
| US-033 a US-035 | Política de estados terminales (`Cancelado`, `Reprogramado`, `Operado`), reemplazo de horario en demoras/adelantos, bloqueo de cambio de fecha dentro de 48 h, contador de cupos vendidos separado de asientos físicos y tarjeta de prueba con rechazo determinista (`4000 0000 0000 0002`). |

| Requisito | Estado y límite |
| --- | --- |
| RF-001, RF-002, RF-003 | Datos persistentes en Supabase; CRUD, reserva transaccional y contador de cupos vendidos separado de asientos asignados (US-034). |
| RF-004 | Pago de prueba (aprobación y tarjeta de rechazo determinista US-035), invoice y e-ticket en PDF con envío por correo. No hay cobro real ni facturación fiscal AFIP. |
| RF-005 | Avisos en base y cola de correos SMTP tolerante a fallos con motivo personalizado ante cambios o cancelaciones de vuelo (US-025, US-026). |
| RF-006 | Reporte de ocupación filtrable por vuelo, clase y rango de fechas, totales consolidados, detalle de pasajes confirmados por fila y descarga CSV (US-027, US-028). |
| RF-007 | Diseño adaptable a móvil para búsqueda y compra web (US-029, US-030). No se construyó app nativa ni notificaciones push. |
| RF-008 | Tickets digitales consultables en línea y descargables como archivo autónomo para abrir sin conexión. La copia es una captura del momento; falta sincronización automática offline. |
| RF-009 | Supabase Auth, confirmación de correo habilitada, rol inicial pasajero, sesión y RLS. Falta probar entrega real del correo y recuperación de contraseña. |
| RF-010 | Manifiesto, check-in por documento, asiento, equipaje, pase de embarque, bloqueo de asientos y desglose de cupos vendidos frente a asientos asignados (US-034). |
| RF-011 | Contingencias con política de estados terminales, límite de 48 h para cambio de fecha, conservación de asientos/check-in en ajustes horarios y avisos/cancelación de reservas afectadas (US-033). |

Las metas no funcionales de carga, disponibilidad, accesibilidad y recuperación ante fallos necesitan pruebas en un entorno representativo. Los datos semilla y las cuentas creadas para esta validación son de prueba.
