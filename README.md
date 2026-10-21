# SIGV · Next.js y Supabase

Sistema Integral de Gestión de Vuelos y Venta de Pasajes. La aplicación usa Next.js 16, App Router, TypeScript, Supabase Auth y el SDK de Supabase. No usa Prisma. La identidad visual sigue los wireframes de SIGV. El esquema Prisma recibido se conserva en docs solo como referencia histórica.

## Versiones desplegadas

| Sprint | Rama | APP_SPRINT | URL |
| --- | --- | --- | --- |
| Sprint 1 | `sprint-1` | `1` | [Abrir Sprint 1](https://sigv-next-hgl8-git-sprint-1-enry6tzs-projects.vercel.app) |
| Sprint 2 | `sprint-2` | `2` | [Abrir Sprint 2](https://sigv-next-hgl8-git-sprint-2-enry6tzs-projects.vercel.app) |
| Sprint 3 | `main` | `3` | [Abrir Sprint 3](https://sigv-next-hgl8.vercel.app) |

Las tres ramas comparten el código completo y se despliegan en el proyecto Vercel `sigv-next-hgl8`. `APP_SPRINT` se configura en Vercel con un valor específico para cada rama; determina el cartel visible y habilita los menús, pantallas y recursos de ese sprint. Las mejoras de código deben sincronizarse en las tres ramas para mantenerlas iguales.

Sprint 1 y Sprint 2 usan URLs estables de rama de Preview, que apuntan al último despliegue de su rama. Vercel puede solicitar iniciar sesión para acceder a esos previews. Sprint 3 usa la URL de producción. Todas las versiones usan `DATA_PROVIDER=supabase` y las variables de conexión de Supabase en su entorno. Los retornos de confirmación de correo requieren permitir el callback de cada entorno en Supabase Auth.

La rama `sprint-1` permite probar la compra completa con `APP_SPRINT=1`: selección de vuelo y cabina, reserva, pago de prueba, mis reservas y comprobantes. El pago sigue siendo simulado; con Supabase, las reservas se guardan y requieren una sesión de pasajero.

## Puesta en marcha

1. Ejecutar npm ci.
2. Copiar .env.sprint3.example a .env.sprint3.local y completar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Mantener DATA_PROVIDER=supabase y APP_SPRINT=3.
3. Aplicar en orden los archivos de supabase/migrations/ en el SQL Editor. El proyecto SIGV de pruebas ya los tiene aplicados hasta 20261008_reservation_contact.sql (incluye columnas contact_email/contact_phone en reservas y firma de sigv_reserve con contacto). Falta aplicar `20261010_payment_inventory.sql`: redefine sigv_demo_payment y sigv_demo_payment_leg para descontar asientos del inventario solo al confirmar el pago exitoso, y ajusta sigv_cancel_reservation para liberar asientos solo de reservas confirmadas. Sin esta migración, US-018 (inventario consistente con el pago) no funciona. Después aplicar, en este orden, `20261021_payment_seat_check.sql` (el pago verifica el cupo con el vuelo bloqueado y la capacidad cuenta solo reservas pagadas), `20261021_check_in_seat_map.sql` (check-in contra el mapa de asientos; marca el asiento como Ocupado) y `20261021_flight_cancellation_policy.sql` (estados 'A reagendar' / 'A reembolsar', avisos con opciones y auditoría de reservas afectadas).
4. En Supabase Auth, habilitar registro por email, exigir confirmación y permitir la URL de retorno del entorno, por ejemplo http://localhost:3001/auth/callback.
5. Para el envío automático de e-tickets y facturas (US-019, desde Sprint 2), completar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y MAIL_FROM. Con Gmail: usar una cuenta dedicada, activar la verificación en dos pasos y poner en SMTP_PASS una contraseña de aplicación (myaccount.google.com/apppasswords), nunca la contraseña de la cuenta. En Vercel, cargar las mismas variables para Preview (rama sprint-2) y Production. Sin estas variables el pago funciona igual y el correo se omite con un aviso en el log del servidor.
6. Ejecutar npm run dev:s3, o npm run build:s3 seguido de npm run start:s3 para producción local en el puerto 3001.

Los perfiles S1 y S2 usan npm run dev:s1 y npm run dev:s2. Cada .env.sprintN.local define APP_SPRINT y DATA_PROVIDER. Cambiar de perfil requiere reiniciar el servidor y, en producción, recompilar. La contraseña de base y las claves privadas nunca van al cliente.

## Acceso y roles

El registro de pasajeros es público. El formulario pide nombre, apellido, documento numérico, email y contraseña (mínimo 8 caracteres con letras y números, con confirmación); teléfono es opcional. Supabase Auth confirma el correo; la entrega real queda a cargo del proveedor SMTP configurado en el proyecto y puede reenviarse desde el formulario. El trigger de alta crea el perfil y asigna siempre pasajero; el cliente no puede elegir un rol superior. Solo un administrador puede asignar mostrador o admin. Las rutas y operaciones protegidas verifican sesión, rol y políticas RLS.

## Módulos

| Perfil | Módulos visibles |
| --- | --- |
| S1 | Acceso y perfil, búsqueda, vuelos, aeropuertos, aviones, programaciones, frecuencias, configuraciones por clase, cupos, tarifas y usuarios. |
| S2 | S1 + reserva, pago de prueba, comprobantes, contingencias, manifiesto, check-in, boarding pass, asientos, notificaciones y auditoría. |
| S3 | S2 + tickets digitales y reportes. |

src/lib/catalog.ts define el sprint mínimo de cada pantalla y recurso. El servidor oculta menús futuros, devuelve 404 en rutas futuras y SPRINT_DISABLED en APIs futuras. El proveedor mock permite revisar la interfaz sin Supabase; sus escrituras no persisten. El proveedor supabase usa datos reales, RLS y funciones RPC. /api/data/{resource} es la ruta principal; /api/mock/{resource} es un alias compatible.

## Sprint 2 - Historias implementadas

| US | Título | Prioridad | Estado | Detalle |
|----|--------|-----------|--------|---------|
| US-017 | Información de pago | Alta | ✅ Implementada | Página "Datos de Pago" con tarjeta (número 16 dígitos, titular, vencimiento MM/AA, CVV 3-4), validación por campo con mensaje junto al campo afectado, cobro simulado atómico (método "Tarjeta de prueba") y redirección a "¡Reserva Confirmada!". Si otro comprador pagó antes los últimos asientos, el pago informa que no hay cupo y la reserva queda sin confirmar. |
| US-018 | Actualizar inventario vuelos | Alta | ✅ Implementada | Migraciones 20261010_payment_inventory.sql y 20261021_payment_seat_check.sql: el inventario se descuenta solo al confirmar el pago; el pago bloquea el vuelo (FOR UPDATE) y verifica el cupo, así que ante compras simultáneas gana el primer pago y el resto recibe "No hay suficientes asientos"; cancelar una reserva confirmada devuelve sus asientos. |
| US-019 | Recibo notificación | Media | ✅ Implementada | Tras el pago aprobado, el servidor envía por correo (SMTP, sin demorar la respuesta del pago) un e-ticket en PDF por pasajero y tramo y la factura en PDF al correo de contacto de la compra. Las reservas no pagadas no generan comprobantes. En Comprobantes se descargan los mismos PDF (`/api/receipts/{reserva}`) y "Enviar por Email" los reenvía. |
| US-020 | Búsqueda de vuelos y manifiesto | Alta | ✅ Implementada | Manifiesto de mostrador con selector de vuelo (código, ruta, fecha y estado), pasajeros confirmados (reserva, pasajero, documento, asiento, equipaje, estado check-in), buscador por DNI/nombre/código de reserva y mensajes distintos para manifiesto vacío y búsqueda sin resultados. |
| US-021 | Seleccionar pasajero en cabina | Media | ✅ Implementada | Mapa de asientos interactivo filtrado por cabina del pasajero (Disponible/Ocupado/Bloqueado). sigv_check_in (20261021_check_in_seat_map.sql) toma el asiento del mapa, exige que esté libre y sea de la clase contratada y lo marca Ocupado. Un pasaje o vuelo cancelado no admite check-in y se informa el motivo. |
| US-022 | Generar tarjeta de embarque | Alta | ✅ Implementada | Pases emitidos solo tras check-in con asiento. Vista con vuelo, pasajero, asiento, reserva y código QR legible (identificador del pase, reserva, vuelo, fecha y asiento); se imprime o se descarga en PDF (`/api/boarding-passes/{pasajero}`) para entregarlo en forma digital. |
| US-023 | Cambiar vuelo | Media | ✅ Implementada | Contingencias: reprogramar fecha y horario, marcar retrasado o cancelar, siempre con confirmación previa. Al cancelar, cada reserva confirmada pasa a 'A reagendar' si la ruta tiene otro vuelo con lugar en su clase, o a 'A reembolsar' si no; las pendientes de pago se cancelan. Cada pasajero afectado recibe un aviso con sus opciones (Notificaciones) y Auditoría registra usuario, fecha, hora y reservas afectadas. La actualización es por conjuntos: 500 reservas se procesan muy por debajo de 5 s. |
| — | Corrección observaciones Sprint 1 | Alta | ✅ Implementada | C1: Perfil separa Nombre y Apellido en campos distintos. C2: Mensaje unificado "formato de <campo> inválido, debe ser <formato>" para campos numéricos (documento, teléfono). C3: Campos de precio/tarifa usan type=text con inputMode=decimal para quitar botones de incremento/decremento. |

## Datos y límites

Las migraciones incluyen aeropuertos, aviones, programaciones y frecuencias, configuración por clase, vuelos y asientos, perfiles y roles, reservas y pasajeros, pagos e invoices de prueba, avisos y auditoría. Reserva, cupos, pago de prueba, check-in, cancelación y generación de vuelos realizan las operaciones sensibles dentro de PostgreSQL.

El pago es intencionalmente simulado: confirma la reserva y crea un comprobante de prueba, sin cargo real. Los avisos de cambios de vuelo se guardan en la aplicación. El correo saliente se usa para los comprobantes de compra (US-019) mediante el SMTP configurado; con Gmail el límite es de unos 500 destinatarios por día. Los tickets pueden descargarse como copia autónoma para abrir sin conexión, pero esa copia no se sincroniza automáticamente; tampoco hay app móvil nativa. Ver docs/COBERTURA.md, docs/ENDPOINTS.md y docs/VALIDACION.md antes de usar esta base en producción.

### Alta completa de vuelos

El botón Crear vuelo de `/admin/vuelos` (también accesible desde `/admin/vuelo`) reúne datos operativos, aeronave, frecuencia semanal, período de venta, asientos y tarifas por clase, y notas de tarifa. La duración se calcula desde los horarios; una llegada anterior a la salida se interpreta como llegada al día siguiente. Los días de operación se aplican a las fechas dentro del período elegido, igual que en el generador de programaciones existente.

Aplicar `supabase/migrations/20261006_publish_flight_schedule.sql` después de las migraciones anteriores para habilitar el guardado. La función `sigv_publish_flight_schedule` valida el rol administrador y publica la programación, frecuencias, clases y vuelos en una sola transacción. Las notas se guardan en la programación y se copian a los vuelos generados. Estas opciones describen la tarifa; esta alta no implementa un nuevo flujo de check-in online ni de selección de asiento web.

Las capacidades se limitan por clase a las de la aeronave elegida y a la numeración actual de asientos (582 Economy y 12 Primera). El ejemplo de 18 asientos en Primera del wireframe requiere ampliar previamente ese modelo, que actualmente reserva las filas 1–2 para Primera y empieza Economy en la fila 3.

`npm test` comprueba duración, frecuencia, validaciones del alta y traducción de errores. Los detalles de fallos de base de datos se registran en el servidor; la API devuelve mensajes de negocio o un error general sin exponer tablas, restricciones o configuración.

Fuentes: ../User stories.docx, ../Requerimientos de alto nivel.docx, ../wireframes/ y ../modelo de datos/. La guía Recomendaciones-Nextjs-Supabase-Prisma corresponde a otro producto y se usó solo para criterios de estructura; la especificación funcional es SIGV.
