# Operational workspace filters
Objective: improve filtering in the existing SIGV workspace and make individually created flights discoverable in Admin Flights.
Branch: `feat/operational-filters` from `71bef0b`. Delivery: local reviewable commits, then explicit authorization for direct `main` delivery. Runner: `npm test`, lint, typecheck and isolated Sprint 3 browser checks.

## Specs

- S1: “En teoría deberíamos ponerle, por lo menos las cosas principales, selectores, que el mismo selector dentro tenga también buscador.” Provide a reusable searchable selector with a keyboard-operable options list; preserve workspace visual conventions and Spanish UI copy.
- S2: “Y a lo que se pueda poner por fecha, le ponemos por fecha. y también por los atributos principales de cada una de las secciones.” Apply meaningful date/attribute filters to `mostrador/manifiesto`, `mostrador/check-in`, `mostrador/boarding-pass`, `mostrador/asientos`, `admin/aeropuertos`, `admin/capacidades`, `admin/tarifas`, `admin/contingencias`, `admin/usuarios`, and `admin/auditoria`. Leave actual check-in and administrative mutations unchanged; do not add fictitious data or fields.
- S3: Apply the same requirement to `admin/aviones`, `admin/programaciones`, `admin/frecuencias`, `admin/configuraciones`, `admin/asientos`, and `admin/reportes`. Preserve existing report Apply/Clear and download semantics and the existing operational seat actions.
- S4: “en esta no aparecen todos los vuelos” and “mostrando siete de quince registros”. Diagnose `/admin/vuelos`, keep pagination and schedule actions, and include standalone instances in the list without misrepresenting them as editable schedules. Existing API clients retain default behavior; the new list opts in. Filters make both kinds findable.
- S5: “Hacelo con dos implementadores, dos subagentes implementadores y un subagente testeador para que testee que los filtros estén andando. Y vos quedate como integrador y después subimos todo a main.” Two disjoint writer surfaces; one independent tester against integrated local mock state. No use of remote credentials for verification or publication without authorization.

## Tasks

- T1 — S1 — inline, shared control and behavioral predicates — pending.
- T2 — S1/S2 — delegated writer, existing operational workspace module and its tests — pending.
- T3 — S1/S3 — delegated writer, domain manager and occupancy report with their tests — pending.
- T4 — S4 — inline integrator, root cause and opt-in flight list regression — pending.
- T5 — S5 — delegated tester plus integration checks; publication separate — pending.

## Log

### L1 — Original request

```text
vamos a cambiar un poco el codigo, sobretodo para poner filtros que mejoren la ux ui para&#x20;
https://sigv-next-hgl8.vercel.app/mostrador/manifiesto
https://sigv-next-hgl8.vercel.app/mostrador/check-in
https://sigv-next-hgl8.vercel.app/mostrador/boarding-pass
https://sigv-next-hgl8.vercel.app/mostrador/asientos
https://sigv-next-hgl8.vercel.app/admin/aeropuertos
https://sigv-next-hgl8.vercel.app/admin/aviones
https://sigv-next-hgl8.vercel.app/admin/programaciones
https://sigv-next-hgl8.vercel.app/admin/frecuencias
http://sigv-next-hgl8.vercel.app/admin/configuraciones
https://sigv-next-hgl8.vercel.app/admin/capacidades
https://sigv-next-hgl8.vercel.app/admin/tarifas
https://sigv-next-hgl8.vercel.app/admin/contingencias
https://sigv-next-hgl8.vercel.app/admin/asientos
https://sigv-next-hgl8.vercel.app/admin/usuarios
https://sigv-next-hgl8.vercel.app/admin/reportes
https://sigv-next-hgl8.vercel.app/admin/auditoria

En algunos casos tiene filtros, pero son selectores muy básicos. Y en otros casos tiene filtros que funcionan bien, pero no están con una UI buena. En teoría deberíamos ponerle, por lo menos las cosas principales, selectores, que el mismo selector dentro tenga también buscador. Y a lo que se pueda poner por fecha, le ponemos por fecha. y también por los atributos principales de cada una de las secciones.




en esta no aparecen todos los vuelos&#x20;
https://sigv-next-hgl8.vercel.app/admin/vuelos Hacelo con dos implementadores, dos subagentes implementadores y un subagente testeador para que testee que los filtros estén andando. Y vos quedate como integrador y después subimos todo a main. Y vos de paso revisá lo de los vuelos que dice mostrando siete de quince registros y agregamos vuelos y no por suba base y no cambió.
```

### L2 — Baseline

The deployed public flights API returned the seeded standalone codes on matching dates. The local admin list reads only `flight_schedules`; its page size is seven. These are separate mechanisms. The Engram mirror is pending because the runtime has no registered memory identity.
