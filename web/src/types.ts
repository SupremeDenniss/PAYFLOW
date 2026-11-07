export type PaymentStatus =
  | "PAYMENT_STATUS_CREATED"
  | "PAYMENT_STATUS_PROCESSING"
  | "PAYMENT_STATUS_COMPLETED"
  | "PAYMENT_STATUS_FAILED"
  | "PAYMENT_STATUS_RECONCILIATION_REQUIRED";

export type Scenario =
  | "SIMULATION_SCENARIO_APPROVE"
  | "SIMULATION_SCENARIO_DECLINE"
  | "SIMULATION_SCENARIO_TEMPORARY_FAILURE"
  | "SIMULATION_SCENARIO_NETWORK_TIMEOUT"
  | "SIMULATION_SCENARIO_LOST_APPROVAL_RESPONSE";

export interface Payment {
  paymentId: string;
  merchantId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  createdAt?: string;
  updatedAt?: string;
  providerOperationId?: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
  reconciliationRequiredAt?: string;
}

export interface Observation {
  status: PaymentStatus;
  at: string;
}

export interface SessionPayment {
  payment: Payment;
  observations: Observation[];
  submitted: boolean;
  idempotencyKey?: string;
}

export interface HealthState {
  api: boolean | null;
  dependencies: boolean | null;
  worker: boolean | null;
  checkedAt: string | null;
}

export interface OperatorEntry {
  side: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
}

export interface OperatorJournal {
  id: number;
  payment_id: string;
  purpose: string;
  amount: number;
  currency: string;
  entries?: OperatorEntry[];
  posted_at?: string;
}

export interface OperatorInspection {
  payment: { ID: string; MerchantID: string; Status: string };
  provider?: {
    operation_id: string;
    outcome: string;
    logical_charge_id?: string;
  };
  dispatch?: {
    workflow_id: string;
    requested_at: string;
    dispatched_at?: string;
  };
  journals: OperatorJournal[];
}

export interface BenchmarkResult {
  label: string;
  test_name: string;
  date_utc: string;
  duration_seconds: number;
  concurrency: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  requests_per_second: number;
  api_latency: { median_ms: number; p95_ms: number; p99_ms: number };
  workflow_dispatch_latency?: { count: number; average_ms: number };
  submission_to_terminal_latency?: { count: number; average_ms: number };
  temporal_workflow_execution_latency?: { count: number; average_ms: number };
  financial_invariants?: {
    completed: number;
    declined: number;
    pending?: number;
    approval_journals: number;
    violation_count: number;
    passed: boolean;
  };
  pending_submitted_payments?: number;
  passed: boolean;
}

export const statusLabel: Record<PaymentStatus, string> = {
  PAYMENT_STATUS_CREATED: "Created",
  PAYMENT_STATUS_PROCESSING: "Processing",
  PAYMENT_STATUS_COMPLETED: "Completed",
  PAYMENT_STATUS_FAILED: "Declined",
  PAYMENT_STATUS_RECONCILIATION_REQUIRED: "Reconciliation required",
};

export function statusTone(status: PaymentStatus): string {
  switch (status) {
    case "PAYMENT_STATUS_COMPLETED":
      return "success";
    case "PAYMENT_STATUS_FAILED":
      return "danger";
    case "PAYMENT_STATUS_RECONCILIATION_REQUIRED":
      return "warning";
    case "PAYMENT_STATUS_PROCESSING":
      return "info";
    default:
      return "neutral";
  }
}
