// Turns a failed supabase.functions.invoke() into something the UI can
// explain. supabase-js only says "non-2xx status"; the status and our
// error code live on the Response it keeps in error.context.

export interface FunctionFailure {
  /** 'network': the request never got an answer (offline, DNS, CORS). */
  kind: 'network' | 'http';
  status: number | null;
  /** Our `{ error }` code, or the gateway's `code` (e.g. NOT_FOUND). */
  code: string | null;
}

interface ResponseLike {
  status?: number;
  clone?: () => ResponseLike;
  json?: () => Promise<unknown>;
}

export async function describeFunctionError(
  error: unknown,
): Promise<FunctionFailure> {
  const name = (error as { name?: string } | null)?.name;
  const context = (error as { context?: ResponseLike } | null)?.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  if (name === 'FunctionsFetchError' || status === null) {
    return { kind: 'network', status: null, code: null };
  }
  let code: string | null = null;
  try {
    const source = context?.clone ? context.clone() : context;
    const body = (await source?.json?.()) as
      | { error?: unknown; code?: unknown }
      | undefined;
    const raw = body?.error ?? body?.code;
    code = typeof raw === 'string' ? raw : null;
  } catch {
    // Not JSON (HTML error page, empty body). The status still tells a lot.
  }
  return { kind: 'http', status, code };
}

/** 401 from the gateway or from our own session check. */
export function isAuthFailure(failure: FunctionFailure): boolean {
  return failure.status === 401;
}

/**
 * 404 that is not one of our own codes: the function is not deployed on
 * this Supabase project (the gateway answers NOT_FOUND).
 */
export function isNotDeployed(
  failure: FunctionFailure,
  ownCodes: readonly string[] = [],
): boolean {
  return (
    failure.status === 404 &&
    (failure.code === null || !ownCodes.includes(failure.code))
  );
}
