# Validación · 01/10/2026

| Comprobación | Resultado |
| --- | --- |
| Código | npm run typecheck, npm run lint y npm run build:s3 correctos después de integrar Auth, recursos y formulario de registro. |
| Base | Migraciones aplicadas en SIGV; 15 tablas con RLS y permisos explícitos. El índice de documento único y el trigger de perfil se consultaron en SQL Editor: true / true. |
| Registro | Formulario público con nombre, apellido, documento, teléfono opcional, email y contraseña. Auth tiene signup y confirmación de correo activos; URL local de retorno permitida. La entrega real del email no se probó. |
| Roles | Cuenta pasajera y cuenta admin temporales; pasajero no puede abrir /admin/usuarios; admin sí administra roles. |
| Venta | Reserva real de un pasajero, descuento de cupo, pago de prueba, invoice y check-in con asiento 3A y pase. |
| CRUD operativo | Alta/edición/archivo de aeropuerto y vuelo; cambios de cupos y tarifas; alta de avión, programación, frecuencia, configuración por clase y generación de dos vuelos. |
| Asientos | Bloqueo de 3B persistió tras recargar; liberación devolvió el asiento a Disponible. 3A aparece Ocupado por check-in. |
| Avisos y auditoría | Cambio de salida 07:20 a 07:30 registrado con actor, valor anterior y nuevo; avisos al pasajero. Se detectó y corrigió un trigger duplicado. Tras la corrección, un cambio temporal y su reversión elevaron el total de avisos de 4 a 5 y luego a 6: uno por cambio. Se restauró 07:20. |
| Perfiles de sprint | Builds S1, S2 y S3 correctos. Se verificaron 24 recursos/API por perfil y las rutas futuras bloqueadas; en navegador, cada menú mostró solo los módulos habilitados de ese sprint. |
| Comprobantes | El pasajero vio su invoice de prueba asociada a la reserva. |
| Cancelación | Se creó SIGV-D19E1182, se canceló sin pagar y Supabase liberó el cupo. La UI ya no ofrece cancelar una reserva con check-in. |
| Ticket offline | La descarga protegida produjo un HTML autónomo de 915 bytes con vuelo y asiento, sin referencias externas; anónimo recibe 401. |
| Exportación | Administración descargó un CSV de 16 filas de ocupación; anónimo recibe 401. |

Hay datos y dos cuentas temporales usados para la verificación. El inventario previo a limpieza mostró 2 usuarios, 2 reservas, 6 avisos, 3 vuelos, 1 programación, 1 avión y 1 aeropuerto de prueba; no hay reservas ajenas en AR-1420. Al concluir las pruebas hay que limpiar esos registros y borrar las cuentas con autorización en el momento de la acción. La confirmación real de email, el correo comercial, la sincronización offline y la app móvil nativa no están verificados como completos.

Prueba visual del callback permitido: supabase-auth-callback.png.
