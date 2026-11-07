import { describe, expect, it } from "vitest";
import { journalBalance, parseBenchmark, parseInspection } from "./imports";

describe("local evidence imports", () => {
  it("accepts a real benchmark schema and rejects arbitrary statistics", () => {
    const result = parseBenchmark(
      JSON.stringify({
        label: "LOCAL SIMULATED PAYMENT BENCHMARK",
        test_name: "sustained/mixed",
        date_utc: "2026-10-20T18:00:24Z",
        requests_per_second: 41.67,
        total_requests: 5000,
        successful_requests: 5000,
        failed_requests: 0,
        duration_seconds: 120,
        concurrency: 8,
        passed: true,
        api_latency: { median_ms: 3.2, p95_ms: 84.7, p99_ms: 512.6 },
      }),
    );
    expect(result.total_requests).toBe(5000);
    expect(() =>
      parseBenchmark(JSON.stringify({ label: "demo", total_requests: 9999 })),
    ).toThrow("not a supported");
  });

  it("requires matching merchant inspection and balances real entries", () => {
    const journal = {
      id: 1,
      payment_id: "p1",
      purpose: "PAYMENT_APPROVAL",
      amount: 1200,
      currency: "JPY",
      entries: [
        { side: "DEBIT", amount: 1200, currency: "JPY" },
        { side: "CREDIT", amount: 1200, currency: "JPY" },
      ],
    };
    const json = JSON.stringify({
      ok: true,
      data: {
        payment: { ID: "p1", MerchantID: "m1", Status: "COMPLETED" },
        journals: [journal],
      },
    });
    const inspection = parseInspection(json, "m1");
    expect(journalBalance(inspection.journals[0])).toBe("balanced");
    expect(() => parseInspection(json, "m2")).toThrow("merchant");
    expect(() =>
      parseInspection(
        JSON.stringify({
          ok: true,
          data: {
            payment: { ID: "p1", MerchantID: "m1", Status: "COMPLETED" },
            journals: [{ ...journal, payment_id: "other-payment" }],
          },
        }),
        "m1",
      ),
    ).toThrow("structure");
    expect(
      journalBalance({
        ...journal,
        entries: [{ side: "DEBIT", amount: 1200, currency: "JPY" }],
      } as (typeof inspection.journals)[number]),
    ).toBe("unbalanced");
  });
});
