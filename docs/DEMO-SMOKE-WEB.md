# Plan de demo y smoke test de las historias web

Esta guía permite probar US-025 a US-030 y US-033 a US-035 sobre la aplicación Next.js + Supabase existente. Los pagos son simulados. US-031 y US-032 quedan excluidas: no hay PWA, aplicación nativa, push ni almacenamiento offline.

## Preparar la demo

1. Trabajar en la rama `feature/web-user-stories` de esta copia, no en la carpeta original `sigv-next`.
2. Si la copia es nueva, ejecutar `npm ci` antes de iniciar el servidor.
3. Para recorrer las pantallas sin usar datos reales, iniciar desde la raíz del repositorio:

```powershell
$env:APP_SPRINT='3'
$env:DATA_PROVIDER='mock'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

4. Abrir `http://127.0.0.1:3000/api/health`. Verificar `provider: "mock"` y `sprint: 3`.
5. Abrir `/api/data/flights` y anotar la fecha de `AR-1420`; los fixtures usan fechas relativas, no una fecha fija.
6. Preparar un navegador de escritorio y una ventana de 390 px. La revisión en teléfono físico sigue siendo necesaria.

**Límite de la demo mock:** las reservas y los pagos no persisten cambios en Supabase. Los reportes muestran fixtures identificados como simulados. La cola no envía correos. No usar este modo para afirmar persistencia, entrega SMTP o descuentos reales de cupo.

## Preparar las pruebas completas con Supabase

1. Confirmar la instancia de desarrollo y sus migraciones existentes. No seleccionar una base por inferencia.
2. Solo si se prepara otra instancia aún no migrada, aplicar en este orden:
   - `supabase/migrations/2026102901_flight_policy_inventory_payments.sql`.
   - `supabase/migrations/2026102902_flight_mail_outbox.sql`.
3. Configurar `DATA_PROVIDER=supabase`, `APP_SPRINT=3` y las variables Supabase actuales. Reiniciar Next.js.
4. Usar cuentas de prueba con roles pasajero, administrador y mostrador.
5. Crear vuelos futuros a más de 72 horas, uno dentro de 48 horas y vuelos separados para cancelación. Usar contactos y documentos sintéticos.
6. Para correos, configurar un SMTP de pruebas mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. No utilizar destinatarios reales.
7. Para reintentos sin intervención, configurar el programador descrito en [la guía de correos](DEMO-US025-026.md). El procesamiento inicial y el botón administrativo no sustituyen una ejecución periódica.
8. No publicar `SUPABASE_SERVICE_ROLE_KEY` ni `NOTIFICATION_PROCESSOR_SECRET` en variables `NEXT_PUBLIC_`.

Las dos migraciones se aplicaron y verificaron el 29/10/2026 en el destino autorizado `zfchbgjwspslpqnsdkrs`. No volver a aplicarlas para ejecutar esta demo. También se probaron en PostgreSQL 14 local descartable. La entrega SMTP real ya se verificó en Auth y en los recorridos principales de la aplicación; el programador externo de reintentos continúa sin configurar.

## US-025 Correos de contingencia

**Rol y datos:** administrador, vuelo futuro, dos reservas confirmadas con contactos distintos y una pendiente.

1. Abrir `/admin/contingencias`, elegir un vuelo y cambiar efectivamente su horario.
2. Revisar y confirmar. Actualizar el historial de correos.
3. Verificar que cada contacto confirmado tiene un correo con reserva, vuelo, itinerario anterior/nuevo y canales de atención. La reserva pendiente no debe recibirlo.
4. Repetir la misma operación sin cambios: no debe generar otro evento.
5. Con otro vuelo, confirmar una cancelación. Deben conservarse los destinatarios que estaban confirmados antes del cambio de las reservas.
6. Simular SMTP inaccesible. El cambio de vuelo debe guardarse; la cola debe conservar el fallo y permitir su reintento al recuperar el servicio.

**Aprobación:** contactos correctos, historial persistente y operación administrativa independiente de la disponibilidad SMTP. El contacto de una reserva recibe el aviso con todos sus pasajeros; no se inventan correos individuales.

## US-026 Motivo personalizado

1. Llegar a la confirmación de un cambio de horario o cancelación.
2. Escribir dos líneas: `Cuestiones climáticas` y `Revisión <operativa> & seguridad`.
3. Confirmar y comparar el texto del correo con lo escrito.
4. Repetir otro cambio sin motivo.

**Aprobación:** texto y saltos conservados, HTML mostrado como texto seguro, campo vacío permitido y ningún motivo anterior reutilizado.

## US-027 Reporte de ocupación

1. Abrir `/admin/reportes` como administrador.
2. En mock, filtrar `AR-1420`, `Economy` y su fecha; pulsar **Aplicar**.
3. Comprobar **2 vendidos**, **capacidad 86**, **2.33 %** y **1 vuelo**.
4. Descargar CSV: debe coincidir con la tabla filtrada y no incluir DNI.
5. Pulsar **Limpiar**. Deben reaparecer las clases y filas sin ventas.
6. Invertir Desde/Hasta: debe aparecer el error y desaparecer la tabla. Probar también fechas sin resultados.
7. En Supabase, repetir con un vuelo propio: contar pasajeros confirmados, no reservas pendientes/canceladas. Verificar que pasajero y mostrador no acceden al reporte.

**Aprobación:** filas, totales y CSV coherentes. El promedio aritmético y la ocupación global ponderada están identificados por separado.

## US-028 Detalle del reporte

1. Abrir la fila filtrada de US-027.
2. Comprobar reserva, nombre y DNI de cada pasajero confirmado. En el fixture son dos personas de `SIGV-7K2P9`.
3. Comparar cantidad de personas con el valor de vendidos.
4. Volver al reporte: deben conservarse filtros y foco.
5. Abrir una fila de cero ventas: debe aparecer el mensaje de ausencia de confirmados.

**Aprobación:** el detalle tiene exactamente los pasajeros contados en la fila y solo es accesible para administración.

## US-029 Búsqueda web desde el celular

1. Con ancho de 390 px, abrir el buscador y seleccionar EZE → BRC en la fecha de `AR-1420`.
2. Buscar y abrir las clases. Verificar horarios, Economy/Primera y precios.
3. Continuar a la compra: conservar vuelo, clase y cantidad de pasajeros.
4. Buscar una fecha sin resultados y pulsar **Elegir fechas cercanas**.
5. Verificar que se pueda cambiar la fecha sin perder ruta y cantidad.

**Aprobación:** controles utilizables, sin desplazamiento horizontal de toda la página y sin ofrecer clases agotadas para el grupo.

## US-030 Compra y recuperación de conexión

1. Buscar Economy para nueve pasajeros. Completar contacto y nueve documentos distintos válidos.
2. Crear la reserva. Pagar con `4111 1111 1111 1111`, titular `Demo Passenger`, vencimiento `12/99` y CVV `123`.
3. Verificar **Resumen de Reserva** y confirmación. No se procesa dinero real.
4. Repetir con DNI duplicado o contacto inválido: debe impedir reservar.
5. En otra reserva de prueba, interrumpir la petición `/api/data/payments` desde las herramientas del navegador.
6. Verificar aviso, campos conservados y botón habilitado. Una petición sin respuesta vence a los 15 segundos.
7. Recuperar conexión y pulsar **Verificar estado y reintentar**. Si la reserva ya está confirmada, no debe emitirse otro POST. Si todos los tramos siguen pendientes, se permite reintentar.

**Aprobación:** no queda una pantalla bloqueada y un resultado incierto no genera doble venta. En Supabase, revisar una sola confirmación y un único descuento.

## US-033 Estados y horarios

1. En un vuelo futuro, confirmar una reserva y hacer check-in. Anotar asiento y estado.
2. Demorar 10:00 → 11:00; luego 11:00 → 11:30. La salida final debe ser 11:30, no 12:30.
3. Adelantar a 10:30 y luego 09:30, respecto de la programada 10:00. Debe quedar Retrasado y después Activo.
4. Comprobar que los cambios horarios conservan asiento y check-in.
5. Intentar cambiar la fecha de un vuelo dentro de 48 horas: debe rechazar y explicar el límite.
6. Intentar operar un vuelo Cancelado, Reprogramado u Operado: debe indicar estado terminal.
7. En una base local descartable, preparar una salida vencida hace más de dos horas sin despegue. Consultar Contingencias y comprobar Operado.

**Pendiente aceptado por el solicitante:** falta precisar el límite superior de la nueva hora propuesta de demora. Se mantiene la implementación actual, que limita el momento de registrar la operación a la salida vigente +2 h. No se afirma que ese límite sea equivalente al criterio ambiguo del documento. La conversión automática de cualquier cambio de fecha a Reprogramado terminal no es un requisito explícito adicional.

En el Supabase destino se habilitó `pg_cron` y se verificó activo el trabajo de cierre cada minuto. Sin esa extensión, el cierre también se materializa al consultar Contingencias.

## US-034 Cupos vendidos e inventario

1. En Supabase de pruebas, abrir Administración → Capacidades y anotar capacidad, vendidos, disponibles y asignados por clase.
2. Crear una reserva sin pagar: no debe consumir cupos comerciales.
3. Confirmar un pago simulado de dos pasajeros: vendidos +2, disponibles −2 y asignados sin cambios.
4. Consultar Mostrador → Manifiesto/Asientos: debe mostrar los mismos totales.
5. Hacer check-in de un pasajero: asignados +1, vendidos sin cambios.
6. Cancelar otra reserva confirmada sin check-in: debe devolver cupos una sola vez.
7. Probar el reembolso administrativo simulado indicado en [la guía core](DEMO-US033-035.md).
8. Con un último cupo Primera, intentar dos pagos simultáneos: solo uno confirma. Repetir con dos cupos: ambos deben confirmar.

**Aprobación:** sin sobreventa, sin doble devolución y sin confundir venta con asiento asignado.

## US-035 Rechazo simulado

1. Crear una reserva de prueba y anotar inventario.
2. Pagar con `4000 0000 0000 0002`, titular sintético, `12/99` y `123`.
3. Comprobar HTTP **402**, `PAYMENT_DECLINED`, mensaje de rechazo y reserva sin confirmar.
4. Verificar ausencia de e-ticket, factura, correo y descuento de cupos.
5. Repetir el rechazo y después usar la tarjeta aprobada.

**Aprobación:** rechazo reproducible con formato válido; la aprobación posterior funciona sin residuos ni duplicados.

## Ejecutar las comprobaciones automáticas

Con un servidor mock en el puerto elegido:

```powershell
$env:PASSENGER_TEST_BASE_URL='http://127.0.0.1:3000'
npm test
npm run typecheck
npm run lint
```

Detener el servidor antes de `npm run build`. No ejecutar los tests SQL sobre una base que contenga datos reales.

## Evidencia y límites de esta entrega

- Suite integrada: 92 pruebas aprobadas, sin fallos ni omisiones, contra servidor mock.
- Compilación, TypeScript y lint aprobados; la comprobación final se registra en el documento ODD.
- Migraciones nuevas y probes core/cola ejecutados en PostgreSQL 14 local descartable.
- Concurrencia real entre dos conexiones: un ganador con un cupo; dos ganadores con dos cupos; dos tomas de correo diferentes sin bloqueo.
- Navegador Edge: reportes en escritorio/390 px, detalle, filtros, fechas inválidas, rechazo/aprobación y reconciliación sin segundo POST.
- Supabase destino: migraciones aplicadas; probes transaccionales de estados, check-in, cupos, rechazo, idempotencia, reembolso, destinatarios, motivo literal, leases, reintentos y RLS aprobados con rollback. No se conservaron los vuelos sintéticos.
- Web conectada al destino: health `supabase`, Sprint 3; búsqueda AEP → COR del 30/10/2026 con AR-456, precios y selección de Economy, continuación que conserva parámetros y exige autenticación. Ancho 390 px sin desbordamiento horizontal. Reportes/cola y procesador rechazan acceso sin sesión/secreto con 401. Las pantallas administrativas autenticadas sobre datos remotos requieren una sesión de prueba; no se crearon cuentas ni se reemplazaron contraseñas para obtenerla.
- Supabase Auth: SMTP personalizado configurado con las credenciales existentes autorizadas. Conexión/autenticación SMTP local aprobada y enlace de acceso de SIGV recibido en Gmail. Esto no sustituye el smoke de correos de contingencia de US-025/026.
- No se verificaron un dispositivo físico ni el recorrido autenticado completo de la cola de correo. El programador externo de la cola requiere despliegue y variables servidor; el cron de cierre de vuelos sí quedó activo en Supabase.
- US-033 se conserva como fue implementada, con el único pendiente de interpretación de la hora máxima de demora aceptado por el solicitante.

## Pendientes para la puesta en servicio

| Pendiente | Alcance y acción necesaria |
| --- | --- |
| US-033: hora máxima de demora | Definición de negocio aceptada como pendiente. Precisar el límite de la nueva salida antes de cambiar la regla actual. No impide revisar esta PR. |
| Reintentos de correo desatendidos | Desplegar la versión de esta PR; configurar `NOTIFICATION_PROCESSOR_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` solo en servidor, y un programador que invoque el endpoint cada minuto. No se crearon ni exportaron credenciales administrativas desde el navegador. La primera tanda y el procesamiento manual sí están implementados. |
| Recuperación de SMTP | La entrega real de comprobante, cambios de horario y cancelación ya se verificó desde la web con una reserva sintética y el buzón autorizado. Falta repetir desde navegador la caída/recuperación del transporte y el drenaje masivo programado. La cola es global: comprobar aislamiento de destinatarios antes de procesarla. |
| Validación física y despliegue | Los accesos de los tres roles y los recorridos principales ya se verificaron en localhost contra Supabase. Falta teléfono físico y repetición en el despliegue de la PR. La revisión responsive a 390 px no sustituye un dispositivo físico. No se realizó merge ni despliegue a producción. |

Estos pendientes son distintos de las migraciones: ambas ya quedaron aplicadas al destino autorizado, y el cierre periódico de vuelos ya registró una ejecución `succeeded`. Los conteos finales conservaron 1211 vuelos, 19 reservas, 27 pasajeros y 15 pagos; no quedaron vuelos sintéticos ni correos de prueba en cola.

## Evidencias de navegador del 29/10/2026

Las capturas se guardan fuera del repositorio, en `qa-evidence/2026-10-29` de la carpeta de trabajo que contiene esta copia. Hay una carpeta por US y una carpeta `AUTH` para requisitos previos. No publicar capturas con datos de cuentas reales ni enlaces de acceso de un solo uso.

- `AUTH/01-smtp-enabled.png`: SMTP personalizado habilitado y persistido tras recargar el panel.
- `AUTH/02-account-already-confirmed.png`: la cuenta solicitada ya figuraba confirmada desde el 02/10/2026; por ello el reenvío de alta no demuestra un nuevo envío.
- `AUTH/03-magic-link-request-200.png`: solicitud de enlace de acceso completada con HTTP 200 en Auth.
- `AUTH/04-email-delivered-gmail.png`: llegada del correo de acceso de SIGV a la bandeja autorizada.
- El enlace administrativo utilizó la URL de sitio Vercel configurada, no la instancia local con la rama de esta PR. No se cambiaron contraseñas, roles ni la lista de URLs permitidas para obtener una sesión local.
- En ese primer checkpoint, los recorridos autenticados y las capturas de cada US estaban pendientes de iniciar sesión en la instancia local con una cuenta de prueba autorizada. El segundo checkpoint registra la evidencia obtenida después; crear carpetas por sí solo no equivale a aprobar recorridos.

### Segundo checkpoint: cuentas ficticias y smoke autenticado

Se crearon Clara Molina (administración), Bruno Arias (mostrador) y Natalia Soto (pasajero), con correos ficticios bajo `example.com`. Las contraseñas se entregan solo por el canal privado y no forman parte de este documento. Los tres accesos, sus perfiles y permisos fueron comprobados; los perfiles no administrativos no accedieron a reportes de administración. Las cuentas están confirmadas administrativamente y no necesitan recibir un enlace en esos dominios ficticios.

| US | Evidencia observada en Supabase desde navegador | Carpeta local |
| --- | --- | --- |
| US-025 | Historial persistente y recepción en Gmail de cambio horario y cancelación. Tres eventos enviados, cero pendientes, destinatario de prueba aislado. | `US-025` |
| US-026 | Motivo con dos líneas y `<operativa> & seguridad` recibido literalmente como texto; ningún elemento HTML inyectado. La siguiente operación comienza con motivo vacío. | `US-026` |
| US-027 | Vuelo sintético/Economy: 2 vendidos, capacidad 10, ocupación 20%. | `US-027` |
| US-028 | Detalle con exactamente Natalia Soto y Camilo Duarte; regreso al reporte. | `US-028` |
| US-029 | Búsqueda y selección reales a 390 px; ancho del documento 390 px, sin desbordamiento. | `US-029` |
| US-030 | Compra de dos pasajeros desde móvil, confirmación persistente y comprobante recibido en Gmail. | `US-030` |
| US-033 | 10:00 → 11:00 → 11:30 sin acumular; fecha dentro de 48h rechazada; cancelación terminal sin controles operativos. | `US-033` |
| US-034 | Tras el pago: 2 vendidos, 8 disponibles y 0 asignados de 10 cupos Economy. | `US-034` |
| US-035 | Rechazo visible con tarjeta documentada y aprobación posterior sin cambiar los demás datos. | `US-035` |

Datos retenidos para inspección: vuelos `QA-WEB-1029-A` y `QA-WEB-1029-B`; reserva `SIGV-6DECF855`. El primero terminó Cancelado y la reserva A reagendar, coherente con las opciones de la ruta. No se modificaron reservas de otros usuarios.

**No marcar como probado en este recorrido:** CSV descargado (el clic no produjo un evento de descarga capturable), nueve pasajeros reales, pérdida de conexión/reconciliación real, conservación del check-in, reembolso/devolución de cupo desde navegador, concurrencia real ni recuperación SMTP desde la web. Las pruebas automatizadas/locales previas son evidencia distinta y no sustituyen estas capturas. El programador desatendido de correos sigue pendiente.
