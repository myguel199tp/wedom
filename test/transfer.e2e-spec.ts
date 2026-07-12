/**
 * Test de integración funcional del flujo de transferencia (requisito de la prueba).
 *
 * Requiere Postgres disponible. La forma más simple de correrlo:
 *   1) docker compose up -d postgres        # o docker compose up
 *   2) npm run test:e2e
 *
 * Por defecto conecta a localhost:5432 con las credenciales del compose. Se
 * puede sobreescribir con variables de entorno.
 *
 * Cubre:
 *   - registro + login (JWT)
 *   - transferencia pequeña => COMPLETED e impacto inmediato en saldos
 *   - conservación del dinero (lo que sale de uno entra al otro)
 *   - transferencia > $1000 => PENDING_REVIEW (saldo retenido) y aprobación admin
 *   - fondos insuficientes => error semántico
 */
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5432";
process.env.DB_USERNAME ??= "miniwallet";
process.env.DB_PASSWORD ??= "miniwallet";
process.env.DB_NAME ??= "miniwallet";
process.env.DB_SYNCHRONIZE ??= "true";
process.env.JWT_SECRET ??= "test-secret";
process.env.JWT_EXPIRES_IN ??= "24h";
process.env.INITIAL_BALANCE_USD ??= "5000";
process.env.COMPLIANCE_THRESHOLD_USD ??= "1000";
process.env.MAIL_HOST ??= "localhost";
process.env.MAIL_PORT ??= "1025";
process.env.ADMIN_EMAIL ??= "admin@miniwallet.local";
process.env.ADMIN_PASSWORD ??= "Admin123*";

// ── Config anti-fraude para probar las señales nuevas ──
process.env.SUSPICIOUS_VERY_LARGE_AMOUNT_USD ??= "3000";
process.env.SUSPICIOUS_STRUCTURING_MIN_COUNT ??= "3";
process.env.SUSPICIOUS_STRUCTURING_WINDOW_SECONDS ??= "3600";
process.env.SUSPICIOUS_TIMEZONE ??= "America/Bogota";
// Para que ODD_HOURS sea determinista, fijamos la franja "inusual" a la hora
// local actual: toda transferencia creada durante el test cae dentro de ella.
const nowHour =
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: process.env.SUSPICIOUS_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  ) % 24;
process.env.SUSPICIOUS_ODD_HOURS_START = String(nowHour);
process.env.SUSPICIOUS_ODD_HOURS_END = String(nowHour + 1);

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";

describe("MiniWallet - flujo de transferencia (e2e)", () => {
  let app: INestApplication;
  let http: any;

  const ts = Date.now();
  const alice = {
    fullName: "Alice",
    email: `alice-${ts}@test.local`,
    password: "Secret123*",
  };
  const bob = {
    fullName: "Bob",
    email: `bob-${ts}@test.local`,
    password: "Secret123*",
  };
  const carol = {
    fullName: "Carol",
    email: `carol-${ts}@test.local`,
    password: "Secret123*",
  };

  let aliceToken: string;
  let adminToken: string;
  let veryLargeTxId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registra a Alice y a Bob", async () => {
    await request(http).post("/api/auth/register").send(alice).expect(201);
    await request(http).post("/api/auth/register").send(bob).expect(201);
  });

  it("Alice inicia sesión y obtiene un JWT", async () => {
    const res = await request(http)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    aliceToken = res.body.accessToken;
  });

  it("transferencia pequeña ($100) se COMPLETA y mueve el saldo de forma exacta", async () => {
    const res = await request(http)
      .post("/api/wallet/transfer")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ recipientEmail: bob.email, amount: 100 })
      .expect(201);

    expect(res.body.status).toBe("COMPLETED");

    // Alice: 5000 - 100 = 4900 disponible.
    const balAlice = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(balAlice.body.availableBalance).toBe(4900);

    // Bob: 5000 + 100 = 5100 disponible.
    const bobLogin = await request(http)
      .post("/api/auth/login")
      .send({ email: bob.email, password: bob.password })
      .expect(200);
    const balBob = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${bobLogin.body.accessToken}`)
      .expect(200);
    expect(balBob.body.availableBalance).toBe(5100);
  });

  it("fondos insuficientes => código semántico WALLET.INSUFFICIENT_FUNDS", async () => {
    const res = await request(http)
      .post("/api/wallet/transfer")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ recipientEmail: bob.email, amount: 999999 })
      .expect(422);
    expect(res.body.code).toBe("WALLET.INSUFFICIENT_FUNDS");
  });

  it("transferencia > $1000 exige OTP y luego queda PENDING_REVIEW con saldo retenido", async () => {
    // Paso 1: pedir la transferencia => NO se ejecuta, exige OTP.
    const challenge = await request(http)
      .post("/api/wallet/transfer")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ recipientEmail: bob.email, amount: 1500 })
      .expect(200);

    expect(challenge.body.requiresOtp).toBe(true);
    expect(challenge.body.challengeId).toBeDefined();
    // Fuera de producción, el código viene en la respuesta para poder probar.
    expect(challenge.body.debugCode).toBeDefined();

    // Aún no se movió nada: Alice sigue con 4900.
    const balMid = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(balMid.body.availableBalance).toBe(4900);

    // Un código equivocado es rechazado con código semántico.
    const wrong = await request(http)
      .post("/api/wallet/transfer/confirm")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ challengeId: challenge.body.challengeId, code: "000000" })
      .expect(401);
    expect(wrong.body.code).toBe("OTP.INVALID");

    // Paso 2: confirmar con el código correcto => se ejecuta y queda en revisión.
    const res = await request(http)
      .post("/api/wallet/transfer/confirm")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        challengeId: challenge.body.challengeId,
        code: challenge.body.debugCode,
      })
      .expect(201);

    expect(res.body.status).toBe("PENDING_REVIEW");
    expect(res.body.reviewReason).toBe("AMOUNT_ABOVE_THRESHOLD");

    // Alice ya vio descontado el disponible: 4900 - 1500 = 3400.
    const balAlice = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(balAlice.body.availableBalance).toBe(3400);
    expect(balAlice.body.pendingOutgoing).toBe(1500);

    // Bob todavía NO tiene el dinero y NO debe enterarse de la transferencia en
    // revisión: no aparece como pendiente ni se expone entrante retenido.
    const bobLogin = await request(http)
      .post("/api/auth/login")
      .send({ email: bob.email, password: bob.password })
      .expect(200);
    const balBob = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${bobLogin.body.accessToken}`)
      .expect(200);
    expect(balBob.body.availableBalance).toBe(5100); // sin cambios aún
    expect(balBob.body.pendingIncoming).toBeUndefined();

    // Un admin la aprueba => se acredita a Bob.
    const adminLogin = await request(http)
      .post("/api/auth/login")
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const approve = await request(http)
      .patch(`/api/admin/transactions/${res.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(approve.body.status).toBe("COMPLETED");

    const balBob2 = await request(http)
      .get("/api/wallet/balance")
      .set("Authorization", `Bearer ${bobLogin.body.accessToken}`)
      .expect(200);
    expect(balBob2.body.availableBalance).toBe(6600); // 5100 + 1500
  });

  it("el endpoint admin de sospechosas requiere rol admin (403 para usuario normal)", async () => {
    const res = await request(http)
      .get("/api/admin/transactions/suspicious")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(403);
    expect(res.body.code).toBe("AUTH.FORBIDDEN_ROLE");
  });

  it("el admin ve la transferencia grande marcada como sospechosa (LARGE_AMOUNT)", async () => {
    const res = await request(http)
      .get("/api/admin/transactions/suspicious")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const hasLarge = res.body.data.some((r: any) =>
      r.reasons.includes("LARGE_AMOUNT"),
    );
    expect(hasLarge).toBe(true);
  });

  it("una transferencia > $3000 se marca VERY_LARGE_AMOUNT (además de LARGE_AMOUNT)", async () => {
    // Alice tiene 3400 disponibles; enviamos 3100 (> umbral de 'muy superior').
    const challenge = await request(http)
      .post("/api/wallet/transfer")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ recipientEmail: bob.email, amount: 3100 })
      .expect(200);
    expect(challenge.body.requiresOtp).toBe(true);

    const res = await request(http)
      .post("/api/wallet/transfer/confirm")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        challengeId: challenge.body.challengeId,
        code: challenge.body.debugCode,
      })
      .expect(201);
    expect(res.body.status).toBe("PENDING_REVIEW");
    veryLargeTxId = res.body.id;

    const suspicious = await request(http)
      .get("/api/admin/transactions/suspicious")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const tx = suspicious.body.data.find((r: any) => r.id === veryLargeTxId);
    expect(tx).toBeDefined();
    expect(tx.reasons).toEqual(
      expect.arrayContaining(["LARGE_AMOUNT", "VERY_LARGE_AMOUNT"]),
    );
  });

  it("varios envíos pequeños del mismo emisor se marcan STRUCTURING (fragmentación)", async () => {
    // Carol (saldo inicial 5000) reparte 1200 en 3 envíos de 400: cada uno está
    // por debajo del umbral (no exige OTP, se completa) pero juntos lo superan.
    await request(http).post("/api/auth/register").send(carol).expect(201);
    const carolLogin = await request(http)
      .post("/api/auth/login")
      .send({ email: carol.email, password: carol.password })
      .expect(200);
    const carolToken = carolLogin.body.accessToken;

    for (let i = 0; i < 3; i++) {
      const r = await request(http)
        .post("/api/wallet/transfer")
        .set("Authorization", `Bearer ${carolToken}`)
        .send({ recipientEmail: bob.email, amount: 400 })
        .expect(201);
      expect(r.body.status).toBe("COMPLETED");
    }

    const suspicious = await request(http)
      .get("/api/admin/transactions/suspicious")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const structured = suspicious.body.data.filter(
      (r: any) =>
        r.senderEmail === carol.email && r.reasons.includes("STRUCTURING"),
    );
    expect(structured.length).toBeGreaterThan(0);
  });

  it("las transferencias en horario inusual se marcan ODD_HOURS y criteria expone los umbrales", async () => {
    const res = await request(http)
      .get("/api/admin/transactions/suspicious")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    // La franja horaria inusual se fijó a la hora actual, así que toda
    // transferencia creada en el test cae dentro de ella.
    const hasOddHours = res.body.data.some((r: any) =>
      r.reasons.includes("ODD_HOURS"),
    );
    expect(hasOddHours).toBe(true);

    // El bloque criteria refleja los nuevos umbrales configurados.
    expect(res.body.criteria.veryLargeAmountAboveUsd).toBe(3000);
    expect(res.body.criteria.structuringMinCount).toBe(3);
    expect(res.body.criteria.structuringWindowSeconds).toBe(3600);
    expect(res.body.criteria.timezone).toBe("America/Bogota");
  });
});
