import type { BenchmarkResult, OperatorInspection } from "./types";

export function parseBenchmark(text: string): BenchmarkResult {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object")
    throw new Error("Not a benchmark JSON object.");
  const result = value as Partial<BenchmarkResult>;
  if (
    result.label !== "LOCAL SIMULATED PAYMENT BENCHMARK" ||
    typeof result.test_name !== "string" ||
    typeof result.date_utc !== "string" ||
    !Number.isFinite(result.requests_per_second) ||
    !Number.isFinite(result.total_requests) ||
    !Number.isFinite(result.failed_requests) ||
    !Number.isFinite(result.successful_requests) ||
    !Number.isFinite(result.duration_seconds) ||
    !Number.isFinite(result.concurrency) ||
    typeof result.passed !== "boolean" ||
    (result.financial_invariants !== undefined &&
      (typeof result.financial_invariants.passed !== "boolean" ||
        !Number.isFinite(result.financial_invariants.violation_count))) ||
    !result.api_latency ||
    !Number.isFinite(result.api_latency.median_ms) ||
    !Number.isFinite(result.api_latency.p95_ms) ||
    !Number.isFinite(result.api_latency.p99_ms)
  ) {
    throw new Error(
      "This is not a supported PAYFLOW single-run benchmark result.",
    );
  }
  return result as BenchmarkResult;
}

export function parseInspection(
  text: string,
  merchantId: string,
): OperatorInspection {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object")
    throw new Error("Not an operator inspection JSON object.");
  const envelope = raw as { ok?: unknown; data?: unknown };
  if (
    envelope.ok !== true ||
    !envelope.data ||
    typeof envelope.data !== "object"
  )
    throw new Error("Operator inspect did not return a successful result.");
  const inspection = envelope.data as Partial<OperatorInspection>;
  if (
    !inspection.payment ||
    typeof inspection.payment.ID !== "string" ||
    inspection.payment.MerchantID !== merchantId ||
    !Array.isArray(inspection.journals) ||
    inspection.journals.some(
      (journal) =>
        !journal ||
        journal.payment_id !== inspection.payment!.ID ||
        typeof journal.purpose !== "string" ||
        typeof journal.currency !== "string" ||
        !Number.isSafeInteger(journal.amount),
    )
  ) {
    throw new Error(
      "Inspection merchant or structure does not match this local session.",
    );
  }
  return inspection as OperatorInspection;
}

export function journalBalance(
  journal: OperatorInspection["journals"][number],
): "balanced" | "unbalanced" | "unverifiable" {
  if (!Array.isArray(journal.entries) || journal.entries.length === 0)
    return "unverifiable";
  let debit = 0n;
  let credit = 0n;
  for (const entry of journal.entries) {
    if (
      !Number.isSafeInteger(entry.amount) ||
      entry.amount <= 0 ||
      entry.currency !== journal.currency
    )
      return "unverifiable";
    if (entry.side === "DEBIT") debit += BigInt(entry.amount);
    else if (entry.side === "CREDIT") credit += BigInt(entry.amount);
    else return "unverifiable";
  }
  return debit === credit ? "balanced" : "unbalanced";
}
