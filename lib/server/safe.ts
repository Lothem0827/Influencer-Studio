import "server-only";

export type ActionResult<T = void> = { ok: true; data?: T; error?: undefined } | { ok: false; error: string; data?: undefined };

/** Run a server action body, turning thrown errors into a serializable result. */
export async function safe<T = void>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
