import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL.UNEXPECTED";
    let message = "Ocurrió un error inesperado.";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === "string") {
          code = b.code;
          message = (b.message as string) ?? message;
          details = b.details;
        } else {
          code = "VALIDATION.FAILED";
          message = "La solicitud contiene datos inválidos.";
          details = b.message ?? b;
        }
      } else {
        message = String(body);
        code = `HTTP.${status}`;
      }
    } else if (exception instanceof Error) {
      // No exponemos el mensaje interno al cliente: se registra en el servidor,
      // pero la respuesta mantiene el mensaje genérico para evitar fuga de
      // detalles (errores de BD, rutas de archivos, stack, etc.).
      this.logger.error(exception.message, exception.stack);
    }

    if (status >= 500) {
      // Blindaje: cualquier 5xx responde con mensaje/código genéricos aunque
      // provenga de una HttpException que hubiera puesto detalles propios.
      code = "INTERNAL.UNEXPECTED";
      message = "Ocurrió un error inesperado.";
      details = undefined;

      this.logger.error(
        `${req.method} ${req.url} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      success: false,
      code,
      message,
      details,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
