import { TRPCError } from "@trpc/server";

/**
 * Application-level error codes the UI is expected to act on.
 * These travel to the client in `error.data.appCode` (see errorFormatter),
 * alongside an optional payload — e.g. BUDGET_EXCEEDED carries the remaining
 * and required amounts so the UI can show exact numbers.
 */
export const APP_ERROR_CODES = [
  "BUDGET_EXCEEDED",
  "ALREADY_REVIEWED",
  "CAMPAIGN_NOT_ACTIVE",
  "CAMPAIGN_NOT_IN_WINDOW",
  "PLATFORM_NOT_ALLOWED",
  "DUPLICATE_URL",
  "BUDGET_BELOW_SPEND",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends TRPCError {
  readonly appCode: AppErrorCode;
  readonly payload?: Record<string, unknown>;

  constructor(opts: {
    appCode: AppErrorCode;
    message: string;
    payload?: Record<string, unknown>;
    /** tRPC transport code; app errors are business-rule rejections, so BAD_REQUEST or CONFLICT */
    code?: "BAD_REQUEST" | "CONFLICT";
  }) {
    super({ code: opts.code ?? "CONFLICT", message: opts.message });
    this.appCode = opts.appCode;
    this.payload = opts.payload;
  }
}
