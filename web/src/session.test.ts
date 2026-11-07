import { describe, expect, it } from "vitest";
import { isTerminal, recordPayment, sessionCounts } from "./session";
import type { Payment } from "./types";

const base: Payment = {
  paymentId: "p1",
  merchantId: "m1",
  amount: "1200",
  currency: "JPY",
  status: "PAYMENT_STATUS_CREATED",
};

describe("session observation", () => {
  it("keeps one payment for an idempotent replay and records changed status once", () => {
    const created = recordPayment([], base, { idempotencyKey: "order-1" });
    const replay = recordPayment(created, base);
    const submitted = recordPayment(
      replay,
      { ...base, status: "PAYMENT_STATUS_PROCESSING" },
      { submitted: true },
    );
    expect(replay).toHaveLength(1);
    expect(replay[0].observations).toHaveLength(1);
    expect(submitted[0].observations.map((item) => item.status)).toEqual([
      "PAYMENT_STATUS_CREATED",
      "PAYMENT_STATUS_PROCESSING",
    ]);
    expect(submitted[0].idempotencyKey).toBe("order-1");
    expect(sessionCounts(submitted).submitted).toBe(1);
  });

  it("counts unresolved separately and treats only approval or decline as terminal", () => {
    const unresolved = {
      ...base,
      status: "PAYMENT_STATUS_RECONCILIATION_REQUIRED",
    } as Payment;
    expect(sessionCounts(recordPayment([], unresolved)).unresolved).toBe(1);
    expect(isTerminal(unresolved)).toBe(false);
    expect(isTerminal({ ...base, status: "PAYMENT_STATUS_COMPLETED" })).toBe(
      true,
    );
    expect(isTerminal({ ...base, status: "PAYMENT_STATUS_FAILED" })).toBe(true);
  });
});
