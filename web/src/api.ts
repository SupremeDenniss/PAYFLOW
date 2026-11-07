import type { Payment, Scenario } from "./types";

const base = "/payflow.v1.PaymentService";

const safeMessages: Record<string, string> = {
  unauthenticated:
    "The merchant key was rejected. Enter a valid local synthetic key.",
  permission_denied:
    "This payment belongs to another merchant or the merchant ID does not match the key.",
  not_found: "No payment was found for this merchant and ID.",
  already_exists:
    "This idempotency key or workflow is already associated with different details.",
  invalid_argument:
    "Check the amount, currency, payment ID, and required fields.",
  unavailable:
    "The API or one of its dependencies is unavailable. The request outcome may be uncertain.",
  deadline_exceeded:
    "The request timed out. Refresh the payment before retrying.",
  failed_precondition:
    "This operation is not allowed in the current payment state.",
  unimplemented: "This local simulation control is disabled on the API.",
};

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(
      safeMessages[code] ??
        "The API could not complete the request. Check its local logs.",
    );
  }
}

async function rpc<T>(
  method: string,
  body: object,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!token) throw new ApiError("unauthenticated");
  let response: Response;
  try {
    response = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    throw new ApiError("unavailable");
  }
  if (!response.ok) {
    let code = "";
    try {
      const error = (await response.json()) as { code?: unknown };
      if (typeof error.code === "string") code = error.code.toLowerCase();
    } catch {
      /* an HTTP proxy may return plain text */
    }
    if (!code)
      code =
        response.status === 401
          ? "unauthenticated"
          : response.status === 404
            ? "not_found"
            : "unavailable";
    throw new ApiError(code, response.status);
  }
  return response.json() as Promise<T>;
}

export async function checkHealth(
  path: "/healthz" | "/readyz" | "/worker-readyz",
): Promise<boolean> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createPayment(
  token: string,
  merchantId: string,
  amount: string,
  idempotencyKey: string,
): Promise<Payment> {
  const result = await rpc<{ payment: Payment }>(
    "CreatePayment",
    { merchantId, idempotencyKey, amount, currency: "JPY" },
    token,
  );
  return result.payment;
}

export async function getPayment(
  token: string,
  paymentId: string,
): Promise<Payment> {
  const result = await rpc<{ payment: Payment }>(
    "GetPayment",
    { paymentId },
    token,
  );
  return result.payment;
}

export async function submitPayment(
  token: string,
  paymentId: string,
): Promise<Payment> {
  const result = await rpc<{ payment: Payment }>(
    "SubmitPayment",
    { paymentId },
    token,
  );
  return result.payment;
}

export async function simulatePayment(
  token: string,
  paymentId: string,
  scenario: Scenario,
): Promise<Payment> {
  const result = await rpc<{ payment: Payment }>(
    "SimulatePayment",
    { paymentId, scenario },
    token,
  );
  return result.payment;
}

export async function reconcilePayment(
  token: string,
  paymentId: string,
): Promise<Payment> {
  const result = await rpc<{ payment: Payment }>(
    "ReconcilePayment",
    { paymentId },
    token,
  );
  return result.payment;
}

export async function getMerchantBalance(token: string): Promise<string> {
  const result = await rpc<{ currency: string; amount: string }>(
    "GetMerchantBalance",
    { currency: "JPY" },
    token,
  );
  if (result.currency !== "JPY" || !/^-?\d+$/.test(String(result.amount)))
    throw new ApiError("invalid_argument");
  return String(result.amount);
}
