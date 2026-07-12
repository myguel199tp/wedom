import { HttpException } from "@nestjs/common";
import { ERRORS, ErrorKey } from "./error-codes";

export class BusinessException extends HttpException {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    key: ErrorKey,
    details?: Record<string, unknown>,
    overrideMessage?: string,
  ) {
    const def = ERRORS[key];
    super(
      {
        success: false,
        code: def.code,
        message: overrideMessage ?? def.message,
        details,
      },
      def.httpStatus,
    );
    this.code = def.code;
    this.details = details;
  }
}
