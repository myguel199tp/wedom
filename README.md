# MiniWallet

Servicio de transferencias de saldo entre usuarios registrados, con historial de
movimientos y control de cumplimiento. Prueba técnica (Wesdom).

Construido con **NestJS + TypeScript + PostgreSQL**, 100% contenerizado.

---

## Ejecución con un solo comando

Requisito: Docker + Docker Compose.

```bash
docker compose up --build
```

Esto levanta **tres** contenedores:

| Servicio          | URL                            | Descripción                |
| ----------------- | ------------------------------ | -------------------------- |
| API MiniWallet    | http://localhost:3000/api      | API REST                   |
| Swagger (docs)    | http://localhost:3000/api/docs | Documentación interactiva  |
| MailHog (correos) | http://localhost:8025          | Bandeja de correo del demo |
| PostgreSQL        | localhost:5432                 | Base de datos              |

La base de datos se crea sola al arrancar (`synchronize: true` en modo demo) y se
crea automáticamente un **usuario admin** (`admin@miniwallet.local`).
**contraseña admin** (`Admin123*`).
Cada usuario nuevo recibe un **saldo de prueba de $5.000 USD** (faucet de demo,
configurable con `INITIAL_BALANCE_USD`) para poder probar transferencias, incluido
el flujo de validación por montos altos.

---

## Prueba rápida (flujo completo)

```bash
# 1) Registrar dos usuarios
curl -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"fullName":"Ana","email":"ana@test.com","password":"Secret123*"}'
curl -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"fullName":"Beto","email":"beto@test.com","password":"Secret123*"}'

# 2) Login de Ana (guarda el accessToken)
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ana@test.com","password":"Secret123*"}'

TOKEN="<pega-el-accessToken>"

# 3) Transferencia normal ($100) -> se COMPLETA al instante
curl -X POST localhost:3000/api/wallet/transfer -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientEmail":"beto@test.com","amount":100}'

# 4) Saldo de Ana (disponible vs pendiente)
curl localhost:3000/api/wallet/balance -H "Authorization: Bearer $TOKEN"

# 5) Transferencia > $1000 -> exige OTP (código al correo del remitente, MailHog)
curl -X POST localhost:3000/api/wallet/transfer -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientEmail":"beto@test.com","amount":1500}'
# -> responde { requiresOtp:true, challengeId:"..." }. Lee el código en http://localhost:8025

# 5b) Confirmar con el código -> se ejecuta y queda PENDING_REVIEW
curl -X POST localhost:3000/api/wallet/transfer/confirm -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"<challengeId>","code":"<codigo-del-correo>"}'

# 6) Login admin y aprobar/revisar sospechosas
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@miniwallet.local","password":"Admin123*"}'
# -> con el token admin:
#    GET   /api/admin/transactions/suspicious
#    PATCH /api/admin/transactions/:id/approve
#    PATCH /api/admin/transactions/:id/reject

# 7) Auditoría (token admin): libro mayor y conciliación del invariante
#    GET /api/admin/audit/ledger            -> rastro contable append-only (paginado)
#    GET /api/admin/audit/reconciliation    -> { balanced: true, ... } si el libro cuadra
```

---

## Endpoints

| Método | Ruta                                    | Auth      | Descripción                                                                                 |
| ------ | --------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`                    | —         | Registro (el usuario elige su contraseña)                                                   |
| POST   | `/api/auth/login`                       | —         | Login → devuelve JWT                                                                        |
| POST   | `/api/auth/recover-password`            | —         | Solicitar recuperación (envía correo con enlace)                                            |
| POST   | `/api/auth/reset-password`              | —         | Restablecer contraseña con el token del correo                                              |
| GET    | `/api/auth/me`                          | JWT       | Perfil del usuario autenticado                                                              |
| GET    | `/api/wallet/balance`                   | JWT       | Saldo **disponible** y **pendiente**                                                        |
| POST   | `/api/wallet/transfer`                  | JWT       | Transferir saldo (atómica, idempotente). Si el monto > umbral, devuelve un **desafío OTP**. |
| POST   | `/api/wallet/transfer/confirm`          | JWT       | Confirmar con el **código OTP** una transferencia > umbral                                  |
| GET    | `/api/wallet/transactions?page=&limit=` | JWT       | Historial paginado                                                                          |
| GET    | `/api/admin/transactions/suspicious`    | JWT admin | Transacciones sospechosas                                                                   |
| PATCH  | `/api/admin/transactions/:id/approve`   | JWT admin | Aprobar transferencia retenida                                                              |
| PATCH  | `/api/admin/transactions/:id/reject`    | JWT admin | Rechazar (reversa el saldo)                                                                 |
| GET    | `/api/admin/audit/ledger?page=&limit=`  | JWT admin | Auditoría: libro mayor paginado (filtros `accountId`, `transactionId`)                      |
| GET    | `/api/admin/audit/reconciliation`       | JWT admin | Auditoría: verifica el invariante Σdébitos − Σcréditos = dinero retenido                    |
| GET    | `/api/health`                           | —         | Liveness                                                                                    |

---

## El requisito con tensión: reflejo inmediato vs. validación por monto

> "Las transferencias deben reflejarse **inmediatamente**... pero toda transacción
> mayor a **$1.000 USD** debe pasar por un proceso de validación antes de confirmarse."

Se resuelve modelando **estados de transacción** y separando **saldo disponible**
de **saldo pendiente**:

- Si el monto **≤ $1.000** → se **debita al instante** al remitente y se acredita
  al destinatario en la misma transacción → estado **`COMPLETED`**.
- Si el monto **> $1.000** → **dos controles en capas**:
  1. **OTP (step-up de seguridad):** la transferencia no se ejecuta hasta que el
     remitente confirma con un código enviado a su correo. Responde _"¿de verdad
     eres tú?"_. Aquí aún **no** se mueve dinero.
  2. Tras confirmar el OTP, se ejecuta: se **debita** al remitente y el dinero queda
     **retenido** (no acreditado al destinatario) → estado **`PENDING_REVIEW`**, a la
     espera de la validación de cumplimiento (admin). Responde _"¿está permitida
     esta operación?"_ (AML).
  - El destinatario **no** ve este dinero: no se le acredita ni se le expone como
    pendiente mientras esté en revisión, porque aún no le pertenece y la operación
    podría rechazarse.
  - Un administrador de cumplimiento **aprueba** (se acredita → `COMPLETED`) o
    **rechaza** (se **reversa** al remitente → `REJECTED`).

Máquina de estados:

```
                    monto ≤ 1000
   [solicitar] ───────────────────────────────► COMPLETED
       │
       │ monto > 1000
       ▼
   OTP requerido ──(código correcto)──► [ejecuta] ──► PENDING_REVIEW
   (nada de dinero                                        │
    se mueve aún)                    (admin aprueba) ─────┼──► COMPLETED
                                     (admin rechaza) ─────┘──► REJECTED
                                                    (saldo devuelto al remitente)
```

**Invariante de conservación del dinero** (nunca se pierde ni se duplica):

```
Σ saldos disponibles  +  Σ montos en PENDING_REVIEW  =  constante
```

El dinero retenido siempre está contabilizado: salió del disponible del remitente
y vive en la transacción hasta que se aprueba (pasa al destinatario) o se rechaza
(vuelve al remitente).

---

## Cómo se garantiza la atomicidad ("no perder ni duplicar dinero")

1. **Transacción de base de datos**: débito, crédito y registro contable ocurren
   dentro de una sola transacción SQL. O todo, o nada.
2. **Bloqueo pesimista** (`SELECT ... FOR UPDATE`) sobre las cuentas involucradas,
   adquirido en **orden determinista** (ids ordenados) para evitar _deadlocks_
   entre transferencias concurrentes.
3. **Dinero en centavos enteros** (`bigint`), nunca flotantes → sin errores de
   redondeo.
4. **Libro mayor de partida doble** (`ledger_entries`), **append-only**: por cada
   transferencia completada, Σdébitos = Σcréditos. Es el rastro de auditoría.
5. **Idempotencia**: el campo `reference` (clave de idempotencia) es único.
   Reintentar la misma petición no ejecuta la transferencia dos veces.

---

## Auditoría (libro mayor y conciliación)

El rastro contable de partida doble no es solo un detalle interno: se expone a
administradores por dos endpoints de solo lectura.

- **`GET /api/admin/audit/ledger`** — el **libro mayor** (`ledger_entries`)
  **append-only** y paginado. Cada fila registra `direction` (`DEBIT`/`CREDIT`),
  `amount`, el `balanceAfter` de la cuenta tras el movimiento, y referencias a
  `transactionId` / `accountId`. Filtrable por `accountId` (todos los movimientos de
  una cuenta) o `transactionId` (la partida doble completa de una operación). Es el
  registro inmutable de _qué pasó, cuándo y sobre qué saldo_.
- **`GET /api/admin/audit/reconciliation`** — verifica el **invariante de
  conservación** sobre el ledger real: `Σdébitos − Σcréditos = dinero retenido`
  (transacciones en `PENDING_REVIEW`). Devuelve `balanced` (bool) más el desglose
  (`totalDebits`, `totalCredits`, `netHeld`, `totalPendingReview`,
  `totalAvailableBalance`). Si `balanced` es `false`, el libro no cuadra y hay una
  discrepancia que investigar.

Así, el invariante descrito arriba deja de ser una promesa del código y se vuelve
**comprobable en caliente**: cualquiera con rol admin puede pedir la conciliación y
confirmar que el sistema no ha perdido ni duplicado dinero.

---

## ¿Qué es una "transacción sospechosa"?

El endpoint admin marca una transacción con una o más señales:

| Señal                    | Definición                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LARGE_AMOUNT`           | Monto por encima del umbral de cumplimiento (> $1.000 USD).                                                                         |
| `VERY_LARGE_AMOUNT`      | Monto por encima de un segundo umbral "muy superior" (> $3.000 USD, config `SUSPICIOUS_VERY_LARGE_AMOUNT_USD`). Acumulativa con la anterior. |
| `HIGH_VELOCITY`          | El mismo remitente hizo más de N transferencias en una ventana corta (config `VELOCITY_MAX_TRANSFERS` / `VELOCITY_WINDOW_SECONDS`). |
| `STRUCTURING`            | Fragmentación (smurfing): ≥ N envíos por debajo del umbral cuya suma lo supera dentro de una ventana (config `SUSPICIOUS_STRUCTURING_MIN_COUNT` / `SUSPICIOUS_STRUCTURING_WINDOW_SECONDS`). |
| `ODD_HOURS`              | Transferencia iniciada en franja horaria inusual, evaluada en la zona horaria de negocio (config `SUSPICIOUS_ODD_HOURS_START` / `SUSPICIOUS_ODD_HOURS_END` / `SUSPICIOUS_TIMEZONE`; soporta cruzar medianoche). |
| `REJECTED_BY_COMPLIANCE` | La transacción fue rechazada en la validación de cumplimiento.                                                                      |

La respuesta incluye, por cada transacción marcada, **el porqué** (`reasons`) para
que un analista la revise.

---

## Manejo de errores (códigos semánticos)

Toda respuesta de error tiene forma estable, con un **`code` legible por máquina**
además del status HTTP:

```json
{
  "success": false,
  "code": "WALLET.INSUFFICIENT_FUNDS",
  "message": "Saldo disponible insuficiente para realizar la transferencia.",
  "details": { "availableBalance": 50, "requested": 100 },
  "path": "/api/wallet/transfer",
  "timestamp": "2026-07-09T..."
}
```

Algunos códigos: `AUTH.INVALID_CREDENTIALS`, `AUTH.ACCOUNT_LOCKED`,
`WALLET.INSUFFICIENT_FUNDS`, `WALLET.CANNOT_TRANSFER_TO_SELF`,
`WALLET.DUPLICATE_TRANSFER`, `COMPLIANCE.TRANSACTION_NOT_IN_REVIEW`.
(Ver [`src/common/errors/error-codes.ts`](src/common/errors/error-codes.ts).)

---

## Tests

Test de integración funcional sobre el flujo de transferencia
([`test/transfer.e2e-spec.ts`](test/transfer.e2e-spec.ts)): registro, login,
transferencia normal, conservación del dinero, **flujo OTP** (código incorrecto
rechazado + confirmación correcta), `PENDING_REVIEW` + aprobación admin, fondos
insuficientes y control de rol.

```bash
docker compose up -d postgres   # necesita Postgres arriba
pnpm install
pnpm run test:e2e
```

---

## Estructura

```
src/
  auth/      → registro/login JWT, guards, roles, seeder de admin
  wallet/    → cuentas, transacciones, libro mayor, transferencia atómica
  admin/     → transacciones sospechosas + aprobar/rechazar
  mailer/    → correos (SMTP/MailHog, desacoplado del proveedor)
  common/    → dinero (centavos), errores semánticos, filtro global
```

Los diagramas de diseño (contexto y contenedores) se entregan en el documento de
análisis, por separado de este repositorio.

---

## Limitaciones conocidas

- **Sin recarga real de saldo.** No hay integración con pasarela de pago; el saldo
  inicial es un _faucet_ de demo (`INITIAL_BALANCE_USD`). En un sistema real, el
  ingreso de fondos sería otro flujo (depósito/pasarela) con su propia conciliación.
- **`synchronize: true` en el demo.** La BD se crea automáticamente para facilitar
  el arranque. En producción esto **debe** apagarse y usar migraciones versionadas
  (el `data-source.ts` en la raíz queda listo como punto de partida para generarlas).
- **Validación de cumplimiento manual.** La aprobación de montos > $1.000 la hace
  un admin por endpoint. No hay un motor de reglas automático ni integración con un
  proveedor KYC/AML real.
- **Correo best-effort y síncrono.** Si el SMTP falla, la operación no se cae, pero
  el envío ocurre en el request (no en cola). Para volumen alto habría que moverlo a
  una cola.
- **Detección de sospechosas en memoria/SQL simple.** Sirve para el alcance de la
  prueba; a gran escala se movería a un pipeline analítico.
- **JWT sin refresh/blacklist.** Token de 24h sin rotación ni revocación.
- **OTP por correo, no SMS/TOTP.** El segundo factor de las transferencias grandes
  viaja por correo (canal del demo). En producción se preferiría SMS/push o TOTP.
  Fuera de producción, el código se devuelve en la respuesta (`debugCode`) para poder
  probar sin abrir el correo.
- **Un solo tipo de moneda (USD).** El campo `currency` existe pero no hay
  conversión multi-moneda.

---

## Cómo escalaría esto

- **Concurrencia / throughput.** El bloqueo pesimista por fila ya permite
  transferencias concurrentes seguras. Para más carga: réplicas de lectura para
  historial/consultas, _connection pooling_ (PgBouncer) y particionar `transactions`
  y `ledger_entries` por fecha.
- **Validación de cumplimiento asíncrona.** Mover la revisión de montos altos a una
  **cola** (p. ej. BullMQ/Redis) con un motor de reglas o un proveedor KYC/AML; la
  API solo encola y responde `PENDING_REVIEW`.
- **Correos y notificaciones fuera del request.** Encolar el envío (cola + worker)
  para que el correo no acople la latencia de la transferencia, con reintentos y
  _dead-letter_.
- **Horizontal + stateless.** La API no guarda estado en memoria; se escala con N
  réplicas detrás de un balanceador. El estado vive en Postgres.
- **Auditoría y observabilidad.** El libro mayor ya da trazabilidad contable; se
  suma _logging_ estructurado, métricas (Prometheus) y trazas distribuidas
  (OpenTelemetry). Un job de conciliación verifica el invariante de conservación.
- **Idempotencia extremo a extremo.** Ya soportada por `reference`; se expone como
  header `Idempotency-Key` estándar en el gateway.
- **Migraciones.** Cambiar `synchronize` por migraciones versionadas en el pipeline
  de despliegue.
