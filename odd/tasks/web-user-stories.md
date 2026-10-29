# Existing web application user stories
Objective: extend the current Next.js + Supabase web application without restructuring. Branch: feature/web-user-stories. Baseline: c10cea16992d2926025cff4dd68f46b55e49e859.
Delivery: isolated work-unit branches integrated into one PR against main; the user explicitly approved the size exception. Checks: npm test; npm run typecheck; npm run lint; npm run build; mock integration and isolated database checks.

## Specs

### S1 - US-025

Título: Notificación por cambios en el vuelo
Prioridad: Alta
Estimado: Medio
Historia de usuario: US-025

Como pasajero con pasaje confirmado
quiero recibir un correo electrónico automático ante cambios de horario o cancelación de mi vuelo con el motivo y los canales de reprogramación
para estar advertido inmediatamente de las contingencias operativas y evitar traslados innecesarios al aeropuerto.
Criterios de aceptación:

Criterio 1: Envío automático ante cancelación de vuelo.
Dado que un administrador confirma la cancelación de un vuelo programado desde la plataforma web
Cuando el sistema actualiza el estado operativo del vuelo
Entonces despacha automáticamente un correo electrónico a cada pasajero afectado con su código de reserva, número de vuelo, aviso explícito de cancelación y vías de contacto para reprogramación o reembolso.

Criterio 2: Envío automático ante reprogramación de horarios
Dado que un administrador modifica los horarios de partida o llegada de un vuelo con pasajes confirmados.
Cuando se guardan los cambios en el sistema.
Entonces envía automáticamente un email a las casillas registradas detallando el nuevo itinerario y el ajuste horario efectuado.

Criterio 3: Encolamiento y tolerancia a fallos SMTP.
Dado que se produce una interrupción transitoria en el servicio de correo electrónico
Cuando se generan eventos masivos de alerta de vuelo
Entonces el sistema encola las notificaciones en segundo plano y mantiene un registro histórico de envíos sin bloquear la continuidad operativa del backend.

### S2 - US-026

Título: Justificación de alteración de fecha de vuelo
Prioridad: Alta
Estimado: Bajo
Historia de usuario: US-026Como administradorquiero poder ingresar un texto personalizado explicando el motivo específico del imprevisto al momento de cancelar o reprogramar un vuelopara que dicha justificación se incluya dinámicamente en el correo y reduzca la incertidumbre de los pasajeros.
Criterios de aceptación:
Criterio 1: Campo de motivo en la confirmación. Dado que accedo a la opción de modificar o cancelar un vueloCuando el sistema solicita mi confirmación finalEntonces me presenta un campo de texto opcional para redactar el motivo de la contingencia (ej. "Cuestiones climáticas").
Criterio 2: Inclusión en la plantilla (Template). Dado que ingresé un motivo personalizadoCuando el sistema arma y despacha el correo a la cola de envíosEntonces incrusta mi texto exactamente como fue redactado en el cuerpo del mensaje.

### S3 - US-027

Título: Reporte de ocupación
Prioridad: Alta
Estimado: Medio
Historia de usuario: US - 027

Como administrador,
quiero consultar un reporte de ocupación filtrando por vuelo, clase y rango de fechas, que muestre asientos vendidos, capacidad y porcentaje de ocupación,
para saber qué tan llenos están los vuelos y tomar decisiones comerciales.
Criterios de aceptación:
Criterio 1: Consulta y filtrado del reporte.
Dado que el administrador se encuentra en la pestaña “Reportes”
Cuando selecciona vuelo, clase y/o rango de fechas y presiona “Aplicar”
Entonces el sistema muestra únicamente las filas que cumplen con los filtros, cada una con asientos vendidos, capacidad y porcentaje de ocupación, y el botón “Limpiar” restablece la vista inicial.

Criterio 2: Cálculo correcto de la ocupación.
Dado que un vuelo tiene pasajes en distintos estados
Cuando el administrador consulta el reporte
Entonces el sistema cuenta solo los pasajes confirmados y calcula la ocupación como vendidos ÷ capacidad × 100.

Criterio 3: Totales consolidados
Dado que el reporte muestra resultados
Cuando el administrador aplica o cambia los filtros
Entonces el sistema actualiza, sobre la tabla, el total de pasajes vendidos, la cantidad de vuelos incluidos y la ocupación promedio del resultado filtrado.

Criterio 4: Filtros inválidos o sin resultados.
Dado que el administrador aplica filtros
Cuando la fecha “Desde” es posterior a “Hasta” o no existen vuelos que cumplan los filtros
Entonces el sistema no muestra la tabla y presenta un mensaje que indica el motivo.

### S4 - US-028

Título: Detalle de pasajes vendidos

Prioridad: Alta
Estimado: Bajo
Historia de usuario: US-028

Como administrador,
quiero abrir el detalle de una fila del reporte y ver los pasajes confirmados de ese vuelo y fecha,
para verificar que los totales del reporte coincidan con las ventas registradas.
Criterios de aceptación:
Criterio 1: Acceso al detalle desde la grilla
Dado que el Administrador se encuentra en la pestaña “Reportes” con resultados en la tabla
Cuando hace click en la fila de un vuelo, fecha y clase
Entonces el sistema despliega un panel de detalle que lista únicamente los pasajes confirmados de esa fila, mostrando código de reserva, nombre y DNI del pasajero.
Criterio 2: Fila sin ventas
Dado que el administrador selecciona una fila que no registra pasajes vendidos
Cuando abre el detalle
Entonces el sistema muestra un mensaje indicando que no existen pasajes confirmados para ese vuelo, fecha y clase.
Criterio 3: Consistencia del total
Dado que el administrador visualiza el detalle de una fila
Cuando el sistema lista los pasajes confirmados
Entonces la cantidad de pasajes listados coincide con el valor de “pasajes vendidos” de esa fila en el reporte.
Criterio 4: Regreso al reporte
            Dado que el administrador se encuentra en el panel de detalle
            Cuando lo cierra o presiona “Volver”
            Entonces el sistema regresa al reporte conservando los filtros aplicados.

### S5 - US-029

Título: Búsqueda de vuelos en app móvil
Prioridad: Alta
Estimado: Medio
Historia de usuario: US-029

Como pasajero desde mi celular,
quiero buscar vuelos disponibles ingresando mi origen, destino y fecha,
para consultar los horarios y precios en una interfaz adaptada a la pantalla de mi celular.
Criterios de aceptación:
Criterio 1: Búsqueda exitosa adaptada a móvil
Dado que el pasajero abre la aplicación móvil y se encuentra en la pantalla de inicio
Cuando ingresa un origen, destino y fecha válidos en los selectores nativos y presiona “Buscar”
Entonces el sistema devuelve una lista de vuelos disponibles, renderizando tarjetas optimizadas para pantallas chicas que discriminan claramente horarios, clases(Economy/Primera) y precios.
Criterio 2: Búsqueda sin resultados
Dado que el pasajero realiza una búsqueda de vuelos en la app
Cuando no existen vuelos programados o con cupo para la fecha y ruta ingresada
Entonces la aplicación muestra un mensaje amigable indicando que no hay vuelos disponibles e invita  al usuario a seleccionar fechas cercanas en el calendario móvil.

### S6 - US-030

Título: Flujo de compra y reserva en aplicación móvil
Prioridad: Alta
Estimado: Alto
Historia de usuario: US-030

Como pasajero desde mi celular,
quiero seleccionar un vuelo, cargar los datos de los pasajeros y completar el pago simulado,
para adquirir mis pasajes íntegramente desde el celular sin depender de una computadora.
Criterios de aceptación:
Criterio 1: Completar reservas desde el celular
Dado que el pasajero seleccionó un vuelo específico desde los resultados de búsqueda móvil
Cuando completa el formulario móvil con los datos de contacto, agrega a sus acompañantes (hasta 9 pasajes) y confirma el pago
Entonces el backend procesa la transacción, bloquea los cupos de los asientos y la aplicación renderiza la pantalla de “Resumen de Reserva” confirmando la operación.
Criterio 2: Manejo de errores de conexión durante el pago
Dado que el pasajero se encuentra en el último paso del flujo de pago móvil
Cuando ocurre una pérdida de señal de internet (timeout) al presionar “Pagar”
Entonces la aplicación intercepta el error, no bloquea la pantalla y muestra un aviso emergente solicitando verificar la conexión antes de reintentar la operación.

### S7 - US-033

Título: Corrección de la política de cambios de estado de vuelo
Prioridad: Alto
Estimado: Medio
Historia de usuario: US-033

Como administrador,
quiero que el sistema aplique la política completa de cambios de estado y de fechas de vuelo,
para que solo se permitan operaciones válidas y las reservas afectadas queden en un estado coherente.

Criterio 1
Dado un vuelo CANCELADO, REPROGRAMADO u OPERADO,
cuando se intenta una operación,
entonces el sistema la rechaza con un mensaje que indica el estado terminal.
Criterio 2
Dado un vuelo ACTIVO,
cuando se registra una demora con hora posterior a la programada y anterior o igual a la salida vigente (+2 h si no despegó),
entonces el vuelo pasa a RETRASADO y la salida vigente se actualiza.
Criterio 3
Dado un vuelo RETRASADO,
cuando se registra una nueva demora,
entonces la nueva hora reemplaza a la anterior y no se acumula.
Criterio 4
Dado un vuelo ACTIVO o RETRASADO,
cuando se adelanta el horario dentro de la misma fecha de servicio,
entonces el vuelo pasa a ACTIVO o RETRASADO según corresponda y la salida vigente se actualiza.
Criterio 5
Dado un vuelo con salida vigente dentro de las próximas 48 horas,
cuando se intenta cambiar la fecha de servicio,
entonces el sistema lo rechaza y explica el límite.
Criterio 6
Dado un vuelo con salida vigente y sin despegue registrado,
cuando pasaron más de 2 horas,
entonces el vuelo pasa a OPERADO y no admite cambios.
Criterio 7
Dado un cambio de horario,
cuando se confirma,
entonces las reservas conservan asiento y check-in y solo se notifica el cambio.

Accepted delivery note for S7: "Dejá la US-033 como está implementada, aclarando ese pendiente, y subí la PR contra main." The new-delay upper-bound interpretation remains explicitly deferred. Automatically making every service-date change terminal Reprogramado is not an explicit acceptance criterion and is not added as a new requirement.

### S8 - US-034

Título: Corrección del contador de cupos vendidos
Prioridad: Media
Estimado: Medio
Historia de usuario: US-034

Como administrador y personal de mostrador,
quiero ver y usar un contador de cupos vendidos por vuelo y clase, distinto de los asientos ocupados en el mapa de cabina,
para calcular la disponibilidad real y evitar la sobreventa.


Criterio 1
Dado un pago confirmado,
cuando termina la transacción,
entonces el contador del vuelo y de la clase se incrementa exactamente en la cantidad de pasajes.
Criterio 2
Dado un pasaje cancelado o reembolsado,
cuando se procesa,
entonces el contador se decrementa y el cupo vuelve a estar disponible.
Criterio 3
Dado un vuelo con 2 cupos disponibles en Primera,
cuando dos usuarios intentan comprar el último cupo a la vez,
entonces solo una compra se confirma y la otra recibe un mensaje de disponibilidad agotada.
Criterio 4
Dado el mapa de cabina,
cuando un cupo está vendido pero sin asiento,
entonces el asiento se muestra libre y el contador refleja la venta; no se confunden ambos conceptos.
Criterio 5
Dado el panel de administración y el de mostrador,
cuando se consulta un vuelo,
entonces se ve el desglose por clase y el total de cupos vendidos.

### S9 - US-035

Título:Tarjeta de prueba con rechazo garantizado

Prioridad: baja
Estimado: Medio
Historia de usuario: US-035

Como equipo de desarrollo y demo,
quiero disponer de una tarjeta de prueba documentada que siempre devuelva RECHAZADO,
para verificar de forma reproducible el escenario 6 sin confundirlo con errores de formato.


Criterio 1
Dado el simulador de pagos,
cuando se usa la tarjeta documentada,
entonces la pasarela devuelve RECHAZADO de forma determinista.
Criterio 2
Dado el formulario de pago,
cuando se ingresa la tarjeta de rechazo con formato válido,
entonces se muestra un mensaje claro y no un error de validación de campos.
Criterio 3
Dado un pago rechazado,
cuando termina la operación,
entonces la reserva no está confirmada y no se emitió e-ticket ni factura.
Criterio 4
Dado un pago rechazado,
cuando se revisa la casilla de correo,
entonces no se envió ningún comprobante.
Criterio 5
Dado un pago rechazado,
cuando se consulta el inventario,
entonces la retención se liberó o tiene vencimiento y no hay cupos huérfanos.

### S10 - User constraints

- "no hay que cambiar la estructura es un proyecto next con supabase esto"
- "bueno lanza 3 agentes full stack que implementen todas las UUS, los pagos  son simulados  tienen que ser una extension de lo que hay hoy, y me tenes que devolver los pasos para que pueda hacer un smoke test de cada una de las uus como plan de demo, vos quedas como tester e integrador tenes que lograr que los agentes trabajen en workthee separados sobre las USS y darle los conjuntos de uss al principio por agente por similitud de trabajo, quee todos usen las skills de impecabble y apple desing y shadcn mcp para todo lo visual"
- "si tienen que migrar bases de datos o lo que sea todos tienen permiso"
- Agreed exclusions: US-031 and US-032. US-029/030 apply only to the current responsive web application. No PWA, native application, push or offline implementation.

## Tasks

- T1 | S7-S9, S10 | delegated: core-us033-035 | verified with accepted S7 delay-bound exception | flight policy, sold inventory and simulated rejection | 3cf0bfa
- T2 | S1-S2, S10 | delegated: mail-us025-026 | implementation and destination SQL verified; live SMTP and deployed scheduler pending | contingency email outbox, custom reason and delivery history | a52fea2
- T3 | S3-S6, S10 | delegated: web-us027-030 | mock flows and public destination search verified; authenticated remote UI and physical device pending | occupancy/detail reports and responsive booking/search | bf35ca4
- T4 | S1-S10 | inline: parent tester/integrator, delegated final long checks | checks and Spanish smoke guide verified; external proof explicitly pending | integration and demo guide | 7f6ad78

## Log

### L1 - Original implementation request 2026-10-29

bueno lanza 3 agentes full stack que implementen todas las UUS, los pagos  son simulados  tienen que ser una extension de lo que hay hoy, y me tenes que devolver los pasos para que pueda hacer un smoke test de cada una de las uus como plan de demo, vos quedas como tester e integrador tenes que lograr que los agentes trabajen en workthee separados sobre las USS y darle los conjuntos de uss al principio por agente por similitud de trabajo, quee todos usen las skills de impecabble y apple desing y shadcn mcp para todo lo visual

### L2 - Additional migration authorization 2026-10-29

"si tienen que migrar bases de datos o lo que sea todos tienen permiso"

### L3 - Routing and safeguards

- Three isolated worktrees named core-us033-035, mail-us025-026 and web-us027-030. Parent owns integration and final testing; workers do not modify the original sibling sigv-next checkout.
- Risk: item 1 (migrations), item 2 (authorization), item 3 (shared APIs), item 4 (transactional inventory and outbox concurrency). Parent independently checks realistic spec scenarios.
- Forecast: approximately 2500-4500 authored changed lines excluding generated dependencies. Keep coherent local work units; PR slicing and publication are not authorized and remain deferred.
- RDD: explicitly off globally; do not enable or start review. Normal verification remains required.
- Engram mirror pending: no authoritative runtime session identity is registered; agent-attributed memory writes are prohibited.
- CodeGraph and project skill registry are absent. Do not initialize indexes. Use bounded source reads and exact injected skills.
- Extend existing helpers: readResource/writeResource, sigv_demo_payment_leg/payment/round_trip_payment, sigv_cancel_reservation, sigv_set_capacity, sigv_flight_changed, sendMail, searchFlights/cabinAvailable and existing form validators. Do not create alternate backend/state paths.
- No remote migrations, real customer changes or real email tests until destination and credential/session are explicitly identified. Existing permission authorizes preparing migrations, not guessing an instance. Local mock tests are safe.
- Docker CLI exists, but its daemon was not running at baseline. Record database proof limitations honestly.
- US-034's last-seat example inconsistently says two available seats. Test one remaining seat for one-winner concurrency and also preserve valid two-seat purchases.
- US-033's delay upper bound and terminal REPROGRAMADO semantics remain ambiguous. Do not silently invent high-consequence policy; surface any unresolved criterion and complete unambiguous work.
- Artifacts preserve existing professional Spanish UI/documentation; identifiers use English. Smoke instructions must be in Spanish. No persona slang in artifacts.
- A shell command to write this document was rejected by policy. No security settings were changed; use only supported file operations that pass their own access checks.

### L4 - Implementation launched and baseline checks

- The supported apply_patch editor created this document successfully. No policy, sandbox, approval or filesystem security configuration was changed. The earlier claim that all writing was blocked was not supported; only the compound shell command had been rejected.
- Three agents launched: implement_core (T1), implement_mail (T2), implement_web (T3), each with exact isolated worktree and allowed edit surfaces. All received Impeccable, Apple Design and shadcn MCP requirements.
- Parent baseline npm test: 61 tests, 56 passed, 0 failed, 5 integration skips without PASSENGER_TEST_BASE_URL. Baseline npm run typecheck passed. Lint pending at this entry.
- Web integration seam: optional timeoutMs on mutate plus reconcilePayment(reservationCodes), preserved when merging simulated payment rejection from core.
- Mail integration seam: distinct BEFORE UPDATE outbox trigger captures confirmed recipients before existing AFTER cancellation processing; both event and flight update share one transaction.

### L5 - Integration and independent verification

- Integrated work units: 3cf0bfa core (source 12fab4b, 802 changed lines), a52fea2 mail (source 935be35, 697 changed lines), bf35ca4 web (source be9b51d, 479 changed lines). Coupled migrations, application behavior, tests and demo notes stay together. No PRs were published during implementation.
- Parent initialized a disposable PostgreSQL 14 cluster bound to loopback only. All baseline migrations and both new migrations applied; core and outbox SQL probes passed. No live Supabase instance or real SMTP was contacted.
- Baseline setup requires integrity before inventory and publish_flight_schedule before admin_flight_list. Alphabetical ordering of same-date historical migrations is insufficient; no historical migration source was changed.
- Actual two-session checkout tests: one remaining Primera seat produced one confirmation/payment and one still-pending reservation; two remaining seats produced two confirmations/payments. Inventory ended at zero without overbooking.
- Actual two-session queue claims returned different rows; second session completed in 44 ms while first session held its lock for three seconds. Lease recovery, stale-token rejection and passenger RLS/direct-write denials passed in SQL probes.
- Integrated suite first exposed one incompatible mail fixture: status Retrasado without a new departure correctly returned 400 under core policy. The fixture now supplies a valid replacement schedule, and mock responses preserve acceptedFields plus literal reason without claiming persistence. A fresh independent scratch recheck passed all seven focused tests and excluded password data from the response.
- Parent integrated suite: 92 passed, zero failed, zero skipped with a mock Sprint 3 server. Browser checks covered report filters/count/detail/return, invalid dates, desktop/mobile 390 px, actual HTTP 402 rejection, simulated approval, lost connection, retained fields and reconciliation without a second payment POST.
- Native assessment was unavailable for the untracked-inventory declaration; it was not treated as low risk or PASS. RDD remained explicitly disabled; independent functional verification covered the named high-risk items.
- Remaining external checks: live Supabase application, SMTP delivery, deployed periodic processing and physical-device review. Local mock does not prove persisted end-to-end sales or delivery.

### L6 - Publication authorization and accepted pending scope

- User: "bien subi la pr contra main"
- Asked: "El cambio supera las 1.974 líneas, y la regla del proyecto exige dividir PRs de más de 400. ¿Autorizás una única PR contra main como excepción de tamaño, dejando explícitos los pendientes de la US-033?"
- User: "si"
- User: "Dejá la US-033 como está implementada, aclarando ese pendiente, y subí la PR contra main."
- One PR against main is authorized as a size exception. US-033 is delivered as implemented with the delay-bound wording explicitly pending. No real payments, PWA, push, offline, remote database migration, deployment or merge is authorized by this publication request.
- The earlier note about automatically making every date change Reprogramado is not an explicit missing criterion; it must not be presented as an additional blocker.

### L7 - Authorized destination migrations and final verification 2026-10-29

- User: "Aplicá las migraciones EN SUPABASE DESTINO PARA QUE QUEDE TODO COMPLETO, verificá que quede todo funcionando y después subí la PR contra main."
- User selected `https://supabase.com/dashboard/project/zfchbgjwspslpqnsdkrs` and authorized using its open browser session. This explicit destination authorization supersedes L6's narrower publication-only scope; it does not authorize merging or deploying application code.
- Applied both 2026102901 and 2026102902 SQL migrations through the authorized Supabase SQL Editor. Captured existing function/trigger/constraint definitions in local temporary backup before DDL. Enabled pg_cron and verified the minute-based sigv-close-due-flights job active with last run succeeded.
- Core rollback-only probe passed on destination: terminal states, schedule guards, check-in retention, sold inventory, simulated decline, idempotency and simulated refund. Mail probe was adapted to one outer transaction without commits/concurrency fixtures; recipient capture, literal reason, no-op deduplication, retry/backoff, leases, stale-token rejection and passenger RLS/write denial passed. All synthetic changes were rolled back; no SMTP send was performed.
- Final destination counts: 1211 flights, 19 reservations, 27 passengers, 15 payments, zero CORE/QA-MAIL flight fixtures and zero outbox entries. Automatic closure may legitimately update expired operational statuses without deleting records.
- Final independent web-agent checks: typecheck PASS; lint PASS; mock production build PASS; 92 tests PASS, zero failed/skipped against mock production server on 3110. Parent spot-check of mail tests: 7/7 PASS. Parent git diff whitespace check was corrected before final publication.
- Actual application against destination on localhost3000: health supabase/Sprint3; AEP to COR on 2026-10-30 returned AR-456, fares and Economy selection; continuation retained flight/class/passenger parameters and required authentication. At 390px, document width equals viewport width. Anonymous reports, flight-mail and scheduler endpoint each returned 401. No application login session was available, so authenticated destination UI is not claimed verified.
- Final Chrome build smoke: report AR-1420/Economy showed two sold, capacity86, 2.33%; detail showed exactly two fixture passengers. Earlier independent Edge checks cover payment recovery and mobile flows. Chrome's hydration warning named a Katalon extension-injected html attribute; no application source workaround or browser-extension changes were made.
- `docs/DEMO-SMOKE-WEB.md` includes each in-scope US, expected results and a dedicated pending-work table. User: "despues create un md con el smoke test y lo que queda pendiente".
- Remaining operational proof: authorized test-mailbox SMTP delivery, server-only processor credentials and periodic mail scheduling in a deployed environment, authenticated destination UI smoke and physical-device testing. These are distinct from the applied database migrations. US-033's delay-bound definition remains accepted pending; US-031/032 remain excluded.
- Risk: items 1, 2, 3, 4 and 5 (stored-data migration, permissions, shared contracts, locking and external environment). RDD is off by explicit global preference; no review or consent lifecycle was started. No authoritative Engram session identity is available; mirror remains pending rather than fabricating attribution.
