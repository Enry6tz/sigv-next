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

## Puesta en marcha

1. Ejecutar npm ci.
2. Copiar .env.sprint3.example a .env.sprint3.local y completar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Mantener DATA_PROVIDER=supabase y APP_SPRINT=3.
3. Aplicar en orden los archivos de supabase/migrations/ en el SQL Editor. El proyecto SIGV de pruebas ya los tiene aplicados hasta 20261001_notification_dedupe.sql.
4. En Supabase Auth, habilitar registro por email, exigir confirmación y permitir la URL de retorno del entorno, por ejemplo http://localhost:3001/auth/callback.
5. Ejecutar npm run dev:s3, o npm run build:s3 seguido de npm run start:s3 para producción local en el puerto 3001.

Los perfiles S1 y S2 usan npm run dev:s1 y npm run dev:s2. Cada .env.sprintN.local define APP_SPRINT y DATA_PROVIDER. Cambiar de perfil requiere reiniciar el servidor y, en producción, recompilar. La contraseña de base y las claves privadas nunca van al cliente.

## Acceso y roles

El registro de pasajeros es público. El formulario pide nombre, apellido, documento, email y contraseña; teléfono es opcional. Supabase Auth confirma el correo. El trigger de alta crea el perfil y asigna siempre pasajero; el cliente no puede elegir un rol superior. Solo un administrador puede asignar mostrador o admin. Las rutas y operaciones protegidas verifican sesión, rol y políticas RLS. La entrega real del correo depende de la configuración del proyecto Supabase.

## Módulos

| Perfil | Módulos visibles |
| --- | --- |
| S1 | Acceso y perfil, búsqueda, vuelos, aeropuertos, aviones, programaciones, frecuencias, configuraciones por clase, cupos, tarifas y usuarios. |
| S2 | S1 + reserva, pago de prueba, comprobantes, contingencias, manifiesto, check-in, boarding pass y asientos. |
| S3 | S2 + notificaciones, tickets digitales, reportes y auditoría. |

src/lib/catalog.ts define el sprint mínimo de cada pantalla y recurso. El servidor oculta menús futuros, devuelve 404 en rutas futuras y SPRINT_DISABLED en APIs futuras. El proveedor mock permite revisar la interfaz sin Supabase; sus escrituras no persisten. El proveedor supabase usa datos reales, RLS y funciones RPC. /api/data/{resource} es la ruta principal; /api/mock/{resource} es un alias compatible.

## Datos y límites

Las migraciones incluyen aeropuertos, aviones, programaciones y frecuencias, configuración por clase, vuelos y asientos, perfiles y roles, reservas y pasajeros, pagos e invoices de prueba, avisos y auditoría. Reserva, cupos, pago de prueba, check-in, cancelación y generación de vuelos realizan las operaciones sensibles dentro de PostgreSQL.

El pago es intencionalmente simulado: confirma la reserva y crea un comprobante de prueba, sin cargo real. Los avisos se guardan en la aplicación; falta correo comercial saliente. Los tickets pueden descargarse como copia autónoma para abrir sin conexión, pero esa copia no se sincroniza automáticamente; tampoco hay app móvil nativa. Ver docs/COBERTURA.md, docs/ENDPOINTS.md y docs/VALIDACION.md antes de usar esta base en producción.

Fuentes: ../User stories.docx, ../Requerimientos de alto nivel.docx, ../wireframes/ y ../modelo de datos/. La guía Recomendaciones-Nextjs-Supabase-Prisma corresponde a otro producto y se usó solo para criterios de estructura; la especificación funcional es SIGV.
