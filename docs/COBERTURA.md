# Cobertura funcional · SIGV

La asignación por sprint es editable: las fuentes SIGV no fijan una división aprobada de las 16 historias. APP_SPRINT aplica el corte en menús, rutas y API.

| Historias | Implementación actual |
| --- | --- |
| US-001 a US-005 | CRUD de vuelos, aeropuertos, aviones, programaciones, frecuencias, cupos y tarifas; reprogramación, cancelación, archivo, generación de vuelos y auditoría. |
| US-006 y US-007 | Búsqueda pública por ruta y fecha, horarios, disponibilidad y comparación de tarifas Economy/Primera. |
| US-008 a US-014 | Registro público de pasajero con datos personales, Supabase Auth, confirmación de correo habilitada, inicio/cierre de sesión, perfil editable con cambio de correo confirmado por enlace, roles protegidos por RLS y mensajes de error traducidos. El reenvío de confirmación está disponible desde el formulario. La entrega real del correo no se verificó con un buzón. |
| US-015 y US-016 | Reserva de 1 a 9 pasajes por clase, clase ajustable también desde la pantalla de compra, acompañantes identificados, documento numérico de 6 a 8 caracteres, un único pasaje por documento y vuelo, contacto del comprador obligatorio y cupos descontados en transacción. |

| Requisito | Estado y límite |
| --- | --- |
| RF-001, RF-002, RF-003 | Datos persistentes en Supabase; CRUD y reserva transaccional probados en navegador. |
| RF-004 | Pago de prueba e invoice persistidos. No hay cobro real, PDF fiscal ni envío de factura por correo. |
| RF-005 | Avisos en base ante cambio de estado, fecha u horario; lectura por pasajero. No hay email/SMS saliente. |
| RF-006 | Reporte de ocupación por vuelo y clase en pantalla y descarga CSV. Faltan filtros avanzados. |
| RF-007 | Diseño adaptable a móvil. No se construyó app nativa. |
| RF-008 | Tickets digitales consultables en línea y descargables como archivo autónomo para abrir sin conexión. La copia es una captura del momento; falta sincronización automática offline. |
| RF-009 | Supabase Auth, confirmación de correo habilitada, rol inicial pasajero, sesión y RLS. Falta probar entrega real del correo y recuperación de contraseña. |
| RF-010 | Manifiesto, check-in por documento, asiento, equipaje, pase de embarque y bloqueo de asientos. |
| RF-011 | Contingencias con avisos y cancelación de reservas afectadas; requieren pruebas de volumen y comunicación externa. |

Las metas no funcionales de carga, disponibilidad, accesibilidad y recuperación ante fallos necesitan pruebas en un entorno representativo. Los datos semilla y las cuentas creadas para esta validación son de prueba.
