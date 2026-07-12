# Decisiones de implementación

Notas breves sobre las decisiones técnicas principales y por qué se tomaron.

---

## Saldo disponible vs. pendiente

Las transferencias se reflejan al instante, pero las mayores a $1.000 USD pasan por
validación antes de confirmarse. Para conciliar ambas cosas, el saldo se separa en
**disponible** (`balanceCents`) y **pendiente** (derivado de las transacciones en
`PENDING_REVIEW`).

Toda transferencia debita al instante el disponible del remitente:

- ≤ umbral → se acredita al destinatario en la misma transacción (`COMPLETED`).
- > umbral → queda retenida (`PENDING_REVIEW`) hasta que un admin la apruebe
  > (`COMPLETED`) o la rechace (`REJECTED`, con reversa al remitente).

El débito inmediato previene el doble gasto, y retener sin acreditar respeta la
política de cumplimiento sin perder dinero (`Σ disponible + Σ pendiente = constante`).

---

## Atomicidad del dinero

- Débito + crédito + registro contable en **una sola transacción de BD** (todo o nada).
- Bloqueo pesimista (`SELECT ... FOR UPDATE`) sobre las cuentas, en orden determinista
  (ids ordenados) para evitar deadlocks.
- Dinero en **centavos enteros** (`bigint`), nunca flotantes.
- Libro mayor de partida doble (`ledger_entries`) append-only para trazabilidad
  (Σdébitos = Σcréditos).

Se mantiene además un `@VersionColumn` como red de seguridad adicional.

---

## Idempotencia

La transferencia acepta una `reference` opcional con restricción única. Si llega una
petición con una `reference` ya usada, se devuelve la transacción existente en vez de
crear otra. Una carrera entre peticiones iguales la resuelve la unique constraint
(error 23505). Evita duplicar dinero por reintentos del cliente.

---

## Stack

NestJS + TypeScript, PostgreSQL con TypeORM y MailHog como SMTP local. Corre con
`docker compose up`.

- **NestJS**: estructura modular, DI, guards/pipes para auth y validación.
- **PostgreSQL**: ACID con bloqueo de filas (`FOR UPDATE`), necesario para la
  atomicidad del dinero.
- **TypeORM**: entidades y manejo de transacciones/locks.
- **MailHog**: correo sin credenciales externas. El `MailerService` está desacoplado,
  así que en producción se cambia por Resend/SES sin tocar a quienes lo llaman.

---

## OTP en transferencias sobre el umbral

Para transferencias **> umbral** se exige un OTP enviado al correo del remitente antes
de ejecutar. El flujo es en dos pasos: `POST /wallet/transfer` (crea el desafío y envía
el código) → `POST /wallet/transfer/confirm` (valida y ejecuta). El OTP se guarda como
hash, con expiración (10 min), límite de intentos (5) y un solo uso. Tras confirmar,
sigue el flujo de cumplimiento normal.

El OTP autentica al ordenante; el cumplimiento autoriza la operación. Aplicarlo solo
sobre el umbral mantiene instantáneos los pagos pequeños.

> Fuera de producción (`NODE_ENV != production`) la respuesta incluye `debugCode` para
> facilitar pruebas. En producción el código solo viaja por correo.

---

## Detección de transacciones sospechosas

`GET /admin/transactions/suspicious` evalúa cada transacción contra varias reglas y la
marca con una o más **razones** (`reasons[]`); solo devuelve las que tienen al menos
una. Los umbrales son configurables por entorno y se exponen en el bloque `criteria`
de la respuesta.

- `LARGE_AMOUNT` — monto > umbral de cumplimiento ($1.000).
- `VERY_LARGE_AMOUNT` — monto > umbral muy superior ($3.000). Acumulativa con la
  anterior.
- `HIGH_VELOCITY` — > N transferencias del emisor en una ventana corta.
- `STRUCTURING` — ≥ N envíos por debajo del umbral cuya suma lo supera dentro de una
  ventana (smurfing). Solo se marcan las transferencias pequeñas del patrón.
- `ODD_HOURS` — iniciada en franja horaria inusual, evaluada en la zona horaria de
  negocio (soporta cruzar medianoche).
- `REJECTED_BY_COMPLIANCE` — rechazada por un admin.

Razones combinables en vez de un booleano: el operador ve por qué es sospechosa y
prioriza. Velocidad y fragmentación se calculan en SQL, y el horario en zona horaria de
negocio (no la del servidor).

---

## Errores con códigos semánticos

Un catálogo central (`ERRORS`) donde cada error tiene `code` estable, `httpStatus` y
mensaje. Se lanzan como `BusinessException` y un `AllExceptionsFilter` global normaliza
toda respuesta de error a `{ success, code, message, details }`. El cliente reacciona a
un `code` estable en lugar de parsear mensajes.

---

Nota sobre el uso de IA

Se utilizó Claude Code (Anthropic) como herramienta de apoyo para tareas repetitivas, la generación de la estructura inicial de algunos módulos, DTOs, configuración de Docker, documentación, borradores de pruebas y apoyo en decisiones de diseño de la interfaz (como selección de colores, estilos y distribución de algunos componentes).

Todo el código, la documentación y las propuestas de diseño generadas fueron revisados, adaptados y validados antes de incorporarse al proyecto.
