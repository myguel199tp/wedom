import { HttpStatus } from "@nestjs/common";

export interface ErrorDefinition {
  code: string;
  httpStatus: HttpStatus;
  message: string;
}

export const ERRORS = {
  EMAIL_ALREADY_REGISTERED: {
    code: "AUTH.EMAIL_ALREADY_REGISTERED",
    httpStatus: HttpStatus.CONFLICT,
    message: "Ya existe un usuario con este correo.",
  },
  INVALID_CREDENTIALS: {
    code: "AUTH.INVALID_CREDENTIALS",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: "Credenciales inválidas.",
  },
  ACCOUNT_LOCKED: {
    code: "AUTH.ACCOUNT_LOCKED",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: "Cuenta bloqueada temporalmente por intentos fallidos.",
  },
  UNAUTHENTICATED: {
    code: "AUTH.UNAUTHENTICATED",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: "Token no proporcionado, inválido o expirado.",
  },
  FORBIDDEN_ROLE: {
    code: "AUTH.FORBIDDEN_ROLE",
    httpStatus: HttpStatus.FORBIDDEN,
    message: "No tienes permisos para esta operación.",
  },

  // ─── Wallet / transferencias ───────────────────────────
  ACCOUNT_NOT_FOUND: {
    code: "WALLET.ACCOUNT_NOT_FOUND",
    httpStatus: HttpStatus.NOT_FOUND,
    message: "Cuenta no encontrada.",
  },
  RECIPIENT_NOT_FOUND: {
    code: "WALLET.RECIPIENT_NOT_FOUND",
    httpStatus: HttpStatus.NOT_FOUND,
    message: "El usuario destino no existe.",
  },
  CANNOT_TRANSFER_TO_SELF: {
    code: "WALLET.CANNOT_TRANSFER_TO_SELF",
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "No puedes transferirte saldo a ti mismo.",
  },
  INVALID_AMOUNT: {
    code: "WALLET.INVALID_AMOUNT",
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "El monto debe ser mayor a cero.",
  },
  INSUFFICIENT_FUNDS: {
    code: "WALLET.INSUFFICIENT_FUNDS",
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "Saldo disponible insuficiente para realizar la transferencia.",
  },
  DUPLICATE_TRANSFER: {
    code: "WALLET.DUPLICATE_TRANSFER",
    httpStatus: HttpStatus.CONFLICT,
    message:
      "Transferencia duplicada: ya existe una operación con esta clave de idempotencia.",
  },

  // ─── OTP (step-up para transferencias > umbral) ───────
  OTP_CHALLENGE_NOT_FOUND: {
    code: "OTP.CHALLENGE_NOT_FOUND",
    httpStatus: HttpStatus.NOT_FOUND,
    message: "Solicitud de confirmación no encontrada o ya utilizada.",
  },
  OTP_INVALID: {
    code: "OTP.INVALID",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: "Código de verificación incorrecto.",
  },
  OTP_EXPIRED: {
    code: "OTP.EXPIRED",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message:
      "El código de verificación expiró. Solicita la transferencia de nuevo.",
  },
  OTP_MAX_ATTEMPTS: {
    code: "OTP.MAX_ATTEMPTS",
    httpStatus: HttpStatus.UNAUTHORIZED,
    message:
      "Demasiados intentos fallidos. Solicita la transferencia de nuevo.",
  },

  // ─── Revisión de cumplimiento ──────────────────────────
  TRANSACTION_NOT_FOUND: {
    code: "COMPLIANCE.TRANSACTION_NOT_FOUND",
    httpStatus: HttpStatus.NOT_FOUND,
    message: "Transacción no encontrada.",
  },
  TRANSACTION_NOT_IN_REVIEW: {
    code: "COMPLIANCE.TRANSACTION_NOT_IN_REVIEW",
    httpStatus: HttpStatus.CONFLICT,
    message: "La transacción no está en estado de revisión.",
  },

  // ─── Admin ─────────────────────────────────────────────
  USER_NOT_FOUND: {
    code: "ADMIN.USER_NOT_FOUND",
    httpStatus: HttpStatus.NOT_FOUND,
    message: "Usuario no encontrado.",
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorKey = keyof typeof ERRORS;
