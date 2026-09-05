import { TRPCError } from "@trpc/server";

/**
 * Application-level errors the UI is expected to act on. Each code carries a
 * payload shape, so both sides agree on what travels with it — the server
 * can't attach the wrong fields, and the client narrows on the code instead
 * of casting.
 *
 * They reach the client in `error.data.appCode` / `error.data.appPayload`
 * (see the errorFormatter in server/trpc.ts).
 */
export type AppErrorPayloads = {
  BUDGET_EXCEEDED: { remainingCents: number; requiredCents: number };
  BUDGET_BELOW_SPEND: { spentCents: number };
  CAMPAIGN_NOT_IN_WINDOW: { startsAt: string; endsAt: string };
  PLATFORM_NOT_ALLOWED: { allowed: string[] };
  ALREADY_REVIEWED: undefined;
  CAMPAIGN_NOT_ACTIVE: undefined;
  DUPLICATE_URL: undefined;
};

export type AppErrorCode = keyof AppErrorPayloads;

export class AppError<C extends AppErrorCode = AppErrorCode> extends TRPCError {
  readonly appCode: C;
  readonly payload: AppErrorPayloads[C];

  constructor(
    opts: {
      appCode: C;
      message: string;
      /** transport code; app errors are business-rule refusals */
      code?: "BAD_REQUEST" | "CONFLICT";
    } & (AppErrorPayloads[C] extends undefined
      ? { payload?: undefined }
      : { payload: AppErrorPayloads[C] }),
  ) {
    super({ code: opts.code ?? "CONFLICT", message: opts.message });
    this.appCode = opts.appCode;
    this.payload = opts.payload as AppErrorPayloads[C];
  }
}

/** Shape the errorFormatter adds to every tRPC error. */
export type AppErrorData = {
  appCode: AppErrorCode | null;
  appPayload: AppErrorPayloads[AppErrorCode] | null;
};

/**
 * Client-side narrowing. Pass a tRPC error and the code you care about; get
 * back the typed payload, or null if it was a different failure.
 *
 *   const budget = appErrorPayload(error, "BUDGET_EXCEEDED");
 *   if (budget) show(budget.remainingCents);   // typed, no cast
 */
export function appErrorPayload<C extends AppErrorCode>(
  error: { data?: unknown } | null | undefined,
  code: C,
): AppErrorPayloads[C] | null {
  const data = error?.data as AppErrorData | undefined;
  if (!data || data.appCode !== code) return null;
  return (data.appPayload ?? undefined) as AppErrorPayloads[C];
}

/** The code of a tRPC error, if it carries one. */
export function appErrorCode(
  error: { data?: unknown } | null | undefined,
): AppErrorCode | null {
  return (error?.data as AppErrorData | undefined)?.appCode ?? null;
}
