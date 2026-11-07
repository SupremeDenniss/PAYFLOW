import type { Payment, SessionPayment } from "./types";

export function recordPayment(
  items: SessionPayment[],
  payment: Payment,
  details?: { submitted?: boolean; idempotencyKey?: string },
): SessionPayment[] {
  const current = items.find(
    (item) => item.payment.paymentId === payment.paymentId,
  );
  const observations = current?.observations ?? [];
  const nextObservations =
    observations.at(-1)?.status === payment.status
      ? observations
      : [
          ...observations,
          { status: payment.status, at: new Date().toISOString() },
        ];
  const next: SessionPayment = {
    payment,
    observations: nextObservations,
    submitted: Boolean(details?.submitted || current?.submitted),
    idempotencyKey: details?.idempotencyKey ?? current?.idempotencyKey,
  };
  return [
    next,
    ...items.filter((item) => item.payment.paymentId !== payment.paymentId),
  ];
}

export function sessionCounts(items: SessionPayment[]) {
  return {
    total: items.length,
    created: items.filter(
      (item) => item.payment.status === "PAYMENT_STATUS_CREATED",
    ).length,
    processing: items.filter(
      (item) => item.payment.status === "PAYMENT_STATUS_PROCESSING",
    ).length,
    completed: items.filter(
      (item) => item.payment.status === "PAYMENT_STATUS_COMPLETED",
    ).length,
    declined: items.filter(
      (item) => item.payment.status === "PAYMENT_STATUS_FAILED",
    ).length,
    unresolved: items.filter(
      (item) =>
        item.payment.status === "PAYMENT_STATUS_RECONCILIATION_REQUIRED",
    ).length,
    submitted: items.filter((item) => item.submitted).length,
  };
}

export function isTerminal(payment: Payment): boolean {
  return (
    payment.status === "PAYMENT_STATUS_COMPLETED" ||
    payment.status === "PAYMENT_STATUS_FAILED"
  );
}
