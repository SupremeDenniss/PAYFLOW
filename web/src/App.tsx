import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Database,
  FileJson,
  Gauge,
  GitBranch,
  HeartPulse,
  KeyRound,
  Layers3,
  LockKeyhole,
  LogOut,
  Menu,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import {
  checkHealth,
  createPayment,
  getMerchantBalance,
  getPayment,
  reconcilePayment,
  simulatePayment,
  submitPayment,
} from "./api";
import { parseBenchmark, parseInspection, journalBalance } from "./imports";
import { isTerminal, recordPayment, sessionCounts } from "./session";
import {
  statusLabel,
  statusTone,
  type BenchmarkResult,
  type HealthState,
  type OperatorInspection,
  type Payment,
  type Scenario,
  type SessionPayment,
} from "./types";

type Page =
  | "overview"
  | "payments"
  | "ledger"
  | "workflows"
  | "infrastructure"
  | "performance";
type Notice = { tone: "success" | "warning" | "danger" | "info"; text: string };

const nav = [
  { id: "overview", label: "Overview", icon: Layers3 },
  { id: "payments", label: "Payments", icon: ArrowDownRight },
  { id: "ledger", label: "Ledger", icon: Wallet },
  { id: "workflows", label: "Workflows", icon: GitBranch },
  { id: "infrastructure", label: "Infrastructure", icon: Database },
  { id: "performance", label: "Performance", icon: Gauge },
] as const;

const scenarios: { value: Scenario; label: string; description: string }[] = [
  {
    value: "SIMULATION_SCENARIO_APPROVE",
    label: "Approve",
    description: "Confirmed mock approval",
  },
  {
    value: "SIMULATION_SCENARIO_DECLINE",
    label: "Decline",
    description: "Confirmed mock decline",
  },
  {
    value: "SIMULATION_SCENARIO_TEMPORARY_FAILURE",
    label: "Temporary failure",
    description: "Recoverable provider outage",
  },
  {
    value: "SIMULATION_SCENARIO_NETWORK_TIMEOUT",
    label: "Network timeout",
    description: "Outcome may remain unknown",
  },
  {
    value: "SIMULATION_SCENARIO_LOST_APPROVAL_RESPONSE",
    label: "Lost approval response",
    description: "Approval may be recovered",
  },
];

function yen(raw: string | number | undefined): string {
  if (raw === undefined) return "—";
  if (typeof raw === "number" && !Number.isSafeInteger(raw)) return "—";
  try {
    return "¥" + new Intl.NumberFormat("en-US").format(BigInt(raw));
  } catch {
    return "—";
  }
}

function when(raw?: string): string {
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.valueOf())
    ? "—"
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function short(raw: string): string {
  return raw.length > 20 ? raw.slice(0, 8) + "…" + raw.slice(-6) : raw;
}
function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

function Status({ status }: { status: Payment["status"] }) {
  return (
    <span className={"status status-" + statusTone(status)}>
      <span className="status-dot" />
      {statusLabel[status] ?? "Unknown"}
    </span>
  );
}

function HealthBadge({
  value,
  label,
}: {
  value: boolean | null;
  label: string;
}) {
  return (
    <span
      className={
        "health-badge " +
        (value === null ? "is-unknown" : value ? "is-up" : "is-down")
      }
    >
      <span className="health-light" />
      {label}: {value === null ? "Checking" : value ? "Ready" : "Unavailable"}
    </span>
  );
}

function Empty({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className={"metric-card " + (tone ? "metric-" + tone : "")}>
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [merchantInput, setMerchantInput] = useState("demo-merchant");
  const keyInput = useRef<HTMLInputElement>(null);
  const token = useRef("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [payments, setPayments] = useState<SessionPayment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [health, setHealth] = useState<HealthState>({
    api: null,
    dependencies: null,
    worker: null,
    checkedAt: null,
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState("");
  const [amount, setAmount] = useState("1200");
  const [idemKey, setIdemKey] = useState<string>(() => crypto.randomUUID());
  const [lookupId, setLookupId] = useState("");
  const [scenario, setScenario] = useState<Scenario>(
    "SIMULATION_SCENARIO_APPROVE",
  );
  const [inspections, setInspections] = useState<OperatorInspection[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [benchmarkIndex, setBenchmarkIndex] = useState(0);

  const counts = sessionCounts(payments);
  const selected =
    payments.find((item) => item.payment.paymentId === selectedId) ?? null;
  const refreshHealth = useCallback(async () => {
    const [api, dependencies, worker] = await Promise.all([
      checkHealth("/healthz"),
      checkHealth("/readyz"),
      checkHealth("/worker-readyz"),
    ]);
    setHealth({
      api,
      dependencies,
      worker,
      checkedAt: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => {
      void refreshHealth();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      const key = token.current;
      if (!key) return;
      const pending = payments.filter(
        (item) => item.submitted && !isTerminal(item.payment),
      );
      void Promise.all(
        pending.map(async (item) => {
          try {
            const payment = await getPayment(key, item.payment.paymentId);
            setPayments((current) => recordPayment(current, payment));
          } catch {
            /* next poll or manual refresh can recover */
          }
        }),
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [connected, payments]);

  const refreshBalance = useCallback(async () => {
    if (!token.current) return;
    try {
      setBalance(await getMerchantBalance(token.current));
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    }
  }, []);

  useEffect(() => {
    if (connected && counts.completed > 0) void refreshBalance();
  }, [connected, counts.completed, refreshBalance]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const candidate = keyInput.current?.value.trim() ?? "";
    const merchant = merchantInput.trim();
    if (!candidate || !merchant) {
      setNotice({
        tone: "warning",
        text: "Enter a merchant ID and local API key.",
      });
      return;
    }
    setBusy("connect");
    try {
      const liveBalance = await getMerchantBalance(candidate);
      token.current = candidate;
      if (keyInput.current) keyInput.current.value = "";
      setMerchantId(merchant);
      setBalance(liveBalance);
      setPayments([]);
      setInspections([]);
      setConnected(true);
      setNotice({
        tone: "success",
        text: "Authenticated. Payment access remains scoped by the API credential.",
      });
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    } finally {
      setBusy("");
    }
  }

  function disconnect() {
    token.current = "";
    if (keyInput.current) keyInput.current.value = "";
    setConnected(false);
    setMerchantId("");
    setBalance(null);
    setPayments([]);
    setInspections([]);
    setSelectedId("");
    setNotice({
      tone: "info",
      text: "Disconnected. Session payment details and imported inspections were cleared.",
    });
  }

  async function act(
    name: string,
    action: () => Promise<Payment>,
    options?: {
      submitted?: boolean;
      idempotencyKey?: string;
      success?: string;
    },
  ) {
    if (!connected) {
      setNotice({
        tone: "warning",
        text: "Connect a local synthetic merchant first.",
      });
      return;
    }
    setBusy(name);
    try {
      const keyUsed = token.current;
      const payment = await action();
      if (keyUsed !== token.current || !token.current) return;
      if (payment.merchantId !== merchantId)
        throw new Error(
          "The returned payment belongs to a different merchant. Disconnect and verify the merchant ID.",
        );
      setPayments((current) => recordPayment(current, payment, options));
      setSelectedId(payment.paymentId);
      setNotice({
        tone: "success",
        text: options?.success ?? "Payment refreshed from the API.",
      });
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    } finally {
      setBusy("");
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!/^[1-9]\d*$/.test(amount) || BigInt(amount) > 9223372036854775807n) {
      setNotice({
        tone: "warning",
        text: "Enter a positive whole-yen amount within the signed 64-bit range.",
      });
      return;
    }
    const key = idemKey.trim();
    if (!key) {
      setNotice({ tone: "warning", text: "Enter an idempotency key." });
      return;
    }
    await act(
      "create",
      () => createPayment(token.current, merchantId, amount, key),
      {
        idempotencyKey: key,
        success: "Payment created or original idempotent payment returned.",
      },
    );
  }

  async function importFiles(
    event: ChangeEvent<HTMLInputElement>,
    kind: "benchmark" | "inspection",
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    try {
      if (kind === "inspection" && !connected)
        throw new Error("Connect a merchant before importing an inspection.");
      for (const file of files) {
        if (file.size > 2_000_000)
          throw new Error("Choose a JSON file under 2 MB.");
        const text = await file.text();
        if (kind === "benchmark") {
          const result = parseBenchmark(text);
          setBenchmarks((current) => [
            result,
            ...current.filter((item) => item.date_utc !== result.date_utc),
          ]);
          setBenchmarkIndex(0);
        } else {
          const result = parseInspection(text, merchantId);
          setInspections((current) => [
            result,
            ...current.filter((item) => item.payment.ID !== result.payment.ID),
          ]);
        }
      }
      setNotice({
        tone: "success",
        text:
          files.length +
          " local evidence file" +
          (files.length === 1 ? "" : "s") +
          " loaded in memory.",
      });
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    }
  }

  const currentBenchmark = benchmarks[benchmarkIndex];

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <strong>
              PAYFLOW<span className="brand-period">.</span>
            </strong>
            <small>OPERATIONS CONSOLE</small>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="nav-group-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={"nav-item " + (page === item.id ? "active" : "")}
                onClick={() => {
                  setPage(item.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {page === item.id && (
                  <ChevronRight size={15} className="nav-chevron" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-rule" />
          <div className="environment-panel">
            <span className="environment-dot" />
            <div>
              <strong>Local development</strong>
              <small>Simulated payments only</small>
            </div>
          </div>
          <div className="sidebar-footnote">
            PAYFLOW / LOCAL CONSOLE
            <br />
            No real money movement
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} className="muted" />
            <strong>{nav.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-local">
              <span className="environment-dot" />
              LOCAL / DEVELOPMENT
            </span>
            <span className="topbar-divider" />
            <span className="topbar-merchant">
              {connected ? merchantId : "Not connected"}
            </span>
            <span className={"avatar " + (connected ? "avatar-on" : "")}>
              {connected ? merchantId.slice(0, 2).toUpperCase() : "—"}
            </span>
          </div>
        </header>
        <main className="main-content">
          {notice && (
            <div role="status" className={"notice notice-" + notice.tone}>
              <CircleAlert size={17} />
              <span>{notice.text}</span>
              <button
                className="icon-button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">PAYFLOW / {page.toUpperCase()}</span>
              <h1>
                {page === "overview"
                  ? "Operations overview"
                  : nav.find((item) => item.id === page)?.label}
              </h1>
              <p>
                {
                  (
                    {
                      overview:
                        "A live view of your local simulated payment workspace.",
                      payments:
                        "Create, submit, and inspect synthetic transactions.",
                      ledger:
                        "Authenticated balance and imported operator evidence.",
                      workflows:
                        "Observed payment state and local workflow evidence.",
                      infrastructure:
                        "Local service health and documented deployment design.",
                      performance:
                        "Analyze actual PAYFLOW benchmark result files.",
                    } as Record<Page, string>
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              <span className="local-pill">
                <span className="environment-dot" /> LOCAL ENVIRONMENT
              </span>
              <button
                className="button button-secondary"
                onClick={() => void refreshHealth()}
              >
                <RefreshCw size={15} />
                Refresh health
              </button>
            </div>
          </div>

          {!connected &&
            page !== "infrastructure" &&
            page !== "performance" && (
              <section className="connect-banner">
                <div className="connect-copy">
                  <div className="connect-icon">
                    <KeyRound size={21} />
                  </div>
                  <div>
                    <strong>Connect a synthetic merchant</strong>
                    <p>
                      Your key stays in this browser tab’s memory and is sent
                      only to the local API through Vite.
                    </p>
                  </div>
                </div>
                <form onSubmit={connect} className="connect-form">
                  <label>
                    <span>Merchant ID</span>
                    <input
                      value={merchantInput}
                      onChange={(event) => setMerchantInput(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>Local API key</span>
                    <input
                      ref={keyInput}
                      type="password"
                      placeholder="pfk_…"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={busy === "connect"}
                  >
                    <LockKeyhole size={15} />
                    {busy === "connect" ? "Connecting…" : "Connect"}
                  </button>
                </form>
              </section>
            )}

          {connected && (
            <div className="session-strip">
              <div>
                <ShieldCheck size={16} />
                <span>
                  Session merchant label <strong>{merchantId}</strong>
                </span>
                <span className="session-separator">/</span>
                <span>Session data only</span>
              </div>
              <button onClick={disconnect} className="text-button">
                <LogOut size={15} />
                Disconnect
              </button>
            </div>
          )}

          {page === "overview" && (
            <>
              <div className="metrics-grid metrics-four">
                <Metric
                  label="API process"
                  value={
                    health.api === null
                      ? "Checking"
                      : health.api
                        ? "Online"
                        : "Offline"
                  }
                  detail="GET /healthz · local"
                  icon={<HeartPulse size={19} />}
                  tone={health.api ? "success" : undefined}
                />
                <Metric
                  label="Dependencies"
                  value={
                    health.dependencies === null
                      ? "Checking"
                      : health.dependencies
                        ? "Ready"
                        : "Unavailable"
                  }
                  detail="API readiness · database / Temporal"
                  icon={<Database size={19} />}
                  tone={health.dependencies ? "success" : undefined}
                />
                <Metric
                  label="Worker"
                  value={
                    health.worker === null
                      ? "Checking"
                      : health.worker
                        ? "Ready"
                        : "Unavailable"
                  }
                  detail="Worker readiness · local"
                  icon={<Activity size={19} />}
                  tone={health.worker ? "success" : undefined}
                />
                <Metric
                  label="Merchant payable"
                  value={connected ? yen(balance ?? undefined) : "—"}
                  detail="Authenticated JPY balance"
                  icon={<Wallet size={19} />}
                  tone="accent"
                />
              </div>
              <div className="content-grid overview-grid">
                <section className="panel">
                  <SectionHead
                    eyebrow="SESSION ACTIVITY"
                    title="Payment status"
                    aside={
                      <button
                        className="link-button"
                        onClick={() => setPage("payments")}
                      >
                        View payments <ArrowRight size={15} />
                      </button>
                    }
                  />
                  <div className="status-summary">
                    <div>
                      <span>Total observed</span>
                      <strong>{counts.total}</strong>
                    </div>
                    <div>
                      <span>Created</span>
                      <strong>{counts.created}</strong>
                    </div>
                    <div>
                      <span>Processing</span>
                      <strong>{counts.processing}</strong>
                    </div>
                    <div>
                      <span>Approved</span>
                      <strong className="text-green">{counts.completed}</strong>
                    </div>
                    <div>
                      <span>Declined</span>
                      <strong className="text-red">{counts.declined}</strong>
                    </div>
                    <div>
                      <span>Unresolved</span>
                      <strong className="text-amber">
                        {counts.unresolved}
                      </strong>
                    </div>
                  </div>
                  <p className="panel-note">
                    Counts include only payments observed in this browser
                    session. They are not account-wide history.
                  </p>
                </section>
                <section className="panel">
                  <SectionHead eyebrow="SYSTEM" title="Service health" />
                  <div className="service-list">
                    <div>
                      <span className="service-icon">
                        <HeartPulse size={17} />
                      </span>
                      <div>
                        <strong>Go ConnectRPC API</strong>
                        <small>127.0.0.1:8080</small>
                      </div>
                      <HealthBadge value={health.api} label="API" />
                    </div>
                    <div>
                      <span className="service-icon">
                        <Database size={17} />
                      </span>
                      <div>
                        <strong>API dependencies</strong>
                        <small>PostgreSQL and Temporal readiness</small>
                      </div>
                      <HealthBadge value={health.dependencies} label="Ready" />
                    </div>
                    <div>
                      <span className="service-icon">
                        <GitBranch size={17} />
                      </span>
                      <div>
                        <strong>Temporal worker</strong>
                        <small>127.0.0.1:9091/readyz</small>
                      </div>
                      <HealthBadge value={health.worker} label="Worker" />
                    </div>
                  </div>
                  <p className="panel-note">
                    Last checked {when(health.checkedAt ?? undefined)}.
                    Readiness does not report uptime.
                  </p>
                </section>
              </div>
              <section className="panel">
                <SectionHead
                  eyebrow="RECENT / THIS SESSION"
                  title="Recent payments"
                  aside={
                    <button
                      className="button button-secondary button-small"
                      onClick={() => setPage("payments")}
                    >
                      <Plus size={14} />
                      New payment
                    </button>
                  }
                />
                {payments.length ? (
                  <PaymentTable
                    items={payments.slice(0, 6)}
                    onSelect={(item) => {
                      setSelectedId(item.payment.paymentId);
                      setPage("payments");
                    }}
                  />
                ) : (
                  <Empty
                    icon={<Layers3 size={23} />}
                    title="No payments observed yet"
                    detail="Connect a synthetic merchant and create or retrieve a payment to populate this session."
                    action={
                      <button
                        className="button button-secondary"
                        onClick={() => setPage("payments")}
                      >
                        Open payments <ArrowRight size={15} />
                      </button>
                    }
                  />
                )}
              </section>
            </>
          )}

          {page === "payments" && (
            <>
              <div className="content-grid payment-grid">
                <section className="panel">
                  <SectionHead
                    eyebrow="NEW TRANSACTION"
                    title="Create payment"
                  />
                  <form className="form-stack" onSubmit={create}>
                    <div className="form-row">
                      <label>
                        <span>Merchant ID</span>
                        <input value={merchantId || merchantInput} readOnly />
                      </label>
                      <label>
                        <span>Currency</span>
                        <input value="JPY · Japanese yen" readOnly />
                      </label>
                    </div>
                    <label>
                      <span>Amount / whole yen</span>
                      <div className="input-prefix">
                        <span>¥</span>
                        <input
                          inputMode="numeric"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          placeholder="1200"
                        />
                      </div>
                    </label>
                    <label>
                      <span>Idempotency key</span>
                      <div className="input-action">
                        <input
                          value={idemKey}
                          onChange={(event) => setIdemKey(event.target.value)}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setIdemKey(crypto.randomUUID())}
                          title="Generate new key"
                        >
                          <RefreshCw size={15} />
                        </button>
                      </div>
                    </label>
                    <p className="form-help">
                      Creating again with the same key and amount returns the
                      original payment. A changed amount produces a conflict.
                    </p>
                    <button
                      className="button button-primary"
                      disabled={!connected || busy === "create"}
                    >
                      <Plus size={15} />
                      {busy === "create" ? "Creating…" : "Create payment"}
                    </button>
                  </form>
                </section>
                <section className="panel">
                  <SectionHead
                    eyebrow="LOCAL DEMO"
                    title="Processing controls"
                  />
                  <div className="form-stack">
                    <p className="panel-intro">
                      Submit queues the server-selected mock outcome. Scenario
                      selection requires the API’s loopback development setting.
                    </p>
                    <label>
                      <span>Selected payment</span>
                      <div className="selected-id">
                        {selected
                          ? short(selected.payment.paymentId)
                          : "Select a payment below"}
                      </div>
                    </label>
                    <button
                      className="button button-primary"
                      disabled={!selected || busy !== ""}
                      onClick={() =>
                        selected &&
                        void act(
                          "submit",
                          () =>
                            submitPayment(
                              token.current,
                              selected.payment.paymentId,
                            ),
                          {
                            submitted: true,
                            success:
                              "Submission accepted. Processing outcome is pending; status polling is active.",
                          },
                        )
                      }
                    >
                      <Play size={15} />
                      Submit payment
                    </button>
                    <div className="form-divider">
                      <span>DEVELOPMENT SCENARIO</span>
                    </div>
                    <label>
                      <span>Provider behavior</span>
                      <select
                        value={scenario}
                        onChange={(event) =>
                          setScenario(event.target.value as Scenario)
                        }
                      >
                        {scenarios.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label} — {item.description}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button-secondary"
                      disabled={!selected || busy !== ""}
                      onClick={() =>
                        selected &&
                        void act(
                          "simulate",
                          () =>
                            simulatePayment(
                              token.current,
                              selected.payment.paymentId,
                              scenario,
                            ),
                          {
                            submitted: true,
                            success:
                              "Local scenario queued. Poll for the confirmed or uncertain outcome.",
                          },
                        )
                      }
                    >
                      <Terminal size={15} />
                      Run local scenario
                    </button>
                    <p className="form-help">
                      These controls operate on synthetic transactions. An
                      accepted submission is never shown as approval.
                    </p>
                  </div>
                </section>
              </div>
              <section className="panel">
                <SectionHead
                  eyebrow="LOOKUP"
                  title="Find an existing payment"
                />
                <form
                  className="lookup-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act("lookup", () =>
                      getPayment(token.current, lookupId.trim()),
                    );
                  }}
                >
                  <div className="input-with-icon">
                    <Search size={16} />
                    <input
                      value={lookupId}
                      onChange={(event) => setLookupId(event.target.value)}
                      placeholder="Paste a payment UUID owned by this merchant"
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={
                      !connected || !lookupId.trim() || busy === "lookup"
                    }
                  >
                    Get payment
                  </button>
                </form>
              </section>
              <div className="content-grid payment-list-grid">
                <section className="panel">
                  <SectionHead
                    eyebrow="OBSERVED / THIS SESSION"
                    title="Payments"
                    aside={
                      <span className="count-tag">
                        {payments.length} records
                      </span>
                    }
                  />
                  {payments.length ? (
                    <PaymentTable
                      items={payments}
                      selectedId={selectedId}
                      onSelect={(item) => setSelectedId(item.payment.paymentId)}
                    />
                  ) : (
                    <Empty
                      icon={<Wallet size={23} />}
                      title="No session payments"
                      detail="Create a payment or retrieve an existing payment by ID."
                    />
                  )}
                </section>
                <section className="panel detail-panel">
                  <SectionHead
                    eyebrow="PAYMENT DETAIL"
                    title={
                      selected
                        ? short(selected.payment.paymentId)
                        : "Select a payment"
                    }
                  />
                  {selected ? (
                    <>
                      <div className="detail-status">
                        <Status status={selected.payment.status} />
                        <span>
                          {yen(selected.payment.amount)} ·{" "}
                          {selected.payment.currency}
                        </span>
                      </div>
                      <div className="detail-list">
                        <div>
                          <span>Payment ID</span>
                          <code>{selected.payment.paymentId}</code>
                        </div>
                        <div>
                          <span>Merchant</span>
                          <strong>{selected.payment.merchantId}</strong>
                        </div>
                        <div>
                          <span>Created</span>
                          <strong>{when(selected.payment.createdAt)}</strong>
                        </div>
                        <div>
                          <span>Updated</span>
                          <strong>{when(selected.payment.updatedAt)}</strong>
                        </div>
                        <div>
                          <span>Provider operation</span>
                          <code>
                            {selected.payment.providerOperationId ||
                              "Not assigned"}
                          </code>
                        </div>
                        <div>
                          <span>Idempotency key</span>
                          <code>
                            {selected.idempotencyKey ||
                              "Not recorded in this session"}
                          </code>
                        </div>
                      </div>
                      <div className="detail-actions">
                        <button
                          className="button button-secondary button-small"
                          disabled={busy !== ""}
                          onClick={() =>
                            void act("refresh", () =>
                              getPayment(
                                token.current,
                                selected.payment.paymentId,
                              ),
                            )
                          }
                        >
                          <RefreshCw size={14} />
                          Refresh
                        </button>
                        <button
                          className="button button-secondary button-small"
                          disabled={busy !== ""}
                          onClick={() =>
                            void act(
                              "reconcile",
                              () =>
                                reconcilePayment(
                                  token.current,
                                  selected.payment.paymentId,
                                ),
                              {
                                success:
                                  "Reconciliation requested. Refresh for the resulting state.",
                              },
                            )
                          }
                        >
                          <Activity size={14} />
                          Reconcile
                        </button>
                        {selected.idempotencyKey && (
                          <button
                            className="button button-secondary button-small"
                            disabled={busy !== ""}
                            onClick={() =>
                              void act(
                                "replay",
                                () =>
                                  createPayment(
                                    token.current,
                                    merchantId,
                                    selected.payment.amount,
                                    selected.idempotencyKey!,
                                  ),
                                {
                                  idempotencyKey: selected.idempotencyKey,
                                  success:
                                    "Same-key request returned the original payment.",
                                },
                              )
                            }
                          >
                            <RefreshCw size={14} />
                            Replay create
                          </button>
                        )}
                      </div>
                      <div className="timeline">
                        <span className="eyebrow">
                          OBSERVED IN THIS SESSION
                        </span>
                        {selected.observations.map((entry, index) => (
                          <div className="timeline-item" key={index}>
                            <span
                              className={
                                "timeline-point " + statusTone(entry.status)
                              }
                            />
                            <div>
                              <strong>{statusLabel[entry.status]}</strong>
                              <small>{when(entry.at)}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon={<Activity size={22} />}
                      title="No payment selected"
                      detail="Select a payment to inspect its real API status and observed transitions."
                    />
                  )}
                </section>
              </div>
            </>
          )}

          {page === "ledger" && (
            <>
              <div className="metrics-grid metrics-three">
                <Metric
                  label="Merchant payable"
                  value={connected ? yen(balance ?? undefined) : "—"}
                  detail="Real authenticated JPY balance"
                  icon={<Wallet size={19} />}
                  tone="accent"
                />
                <Metric
                  label="Approved / session"
                  value={counts.completed}
                  detail="Observed terminal approvals"
                  icon={<Check size={19} />}
                  tone="success"
                />
                <Metric
                  label="Declined / session"
                  value={counts.declined}
                  detail="Observed declines · no approval journal"
                  icon={<ArrowDownRight size={19} />}
                />
              </div>
              <div className="content-grid ledger-grid">
                <section className="panel">
                  <SectionHead
                    eyebrow="AUTHENTICATED API"
                    title="Account balance"
                    aside={
                      <button
                        className="button button-secondary button-small"
                        disabled={!connected}
                        onClick={() => void refreshBalance()}
                      >
                        <RefreshCw size={14} />
                        Refresh
                      </button>
                    }
                  />
                  <div className="balance-display">
                    <span>MERCHANT PAYABLE / JPY</span>
                    <strong>
                      {connected ? yen(balance ?? undefined) : "—"}
                    </strong>
                    <p>
                      {connected
                        ? "Returned by GetMerchantBalance for the authenticated merchant."
                        : "Connect a synthetic merchant to read its balance."}
                    </p>
                  </div>
                  <div className="ledger-note">
                    <ShieldCheck size={18} />
                    <span>
                      Approval journals are posted by the Go backend with
                      payment completion. This screen does not derive the
                      account balance from session payments.
                    </span>
                  </div>
                </section>
                <section className="panel">
                  <SectionHead
                    eyebrow="READ-ONLY OPERATOR EVIDENCE"
                    title="Inspect journals"
                  />
                  <p className="panel-intro">
                    Import JSON captured from the existing loopback-only{" "}
                    <code>
                      go run ./cmd/operator inspect &lt;payment-id&gt;
                    </code>{" "}
                    command. Files stay in this browser tab.
                  </p>
                  <label
                    className={
                      "upload-box " + (!connected ? "upload-disabled" : "")
                    }
                  >
                    <FileJson size={23} />
                    <strong>Choose operator inspection JSON</strong>
                    <span>
                      Merchant ID must match this connected session · max 2 MB
                    </span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={!connected}
                      onChange={(event) =>
                        void importFiles(event, "inspection")
                      }
                    />
                  </label>
                  <p className="panel-note">
                    The CLI uses local database access. The dashboard does not
                    expose an operator HTTP endpoint or database credentials.
                  </p>
                </section>
              </div>
              <section className="panel">
                <SectionHead
                  eyebrow="IMPORTED / VERIFIED LOCALLY"
                  title="Approval journals"
                  aside={
                    <span className="count-tag">
                      {inspections.reduce(
                        (n, item) => n + item.journals.length,
                        0,
                      )}{" "}
                      journals
                    </span>
                  }
                />
                {inspections.some((item) => item.journals.length) ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Payment</th>
                          <th>Journal</th>
                          <th>Purpose</th>
                          <th>Amount</th>
                          <th>Entries</th>
                          <th>Balance check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspections.flatMap((item) =>
                          item.journals.map((journal) => (
                            <tr key={item.payment.ID + "-" + journal.id}>
                              <td>
                                <code>{short(item.payment.ID)}</code>
                              </td>
                              <td>
                                <code>{journal.id}</code>
                              </td>
                              <td>{journal.purpose}</td>
                              <td>{yen(journal.amount)}</td>
                              <td>{journal.entries?.length ?? "—"}</td>
                              <td>
                                <span
                                  className={
                                    "status status-" +
                                    (journalBalance(journal) === "balanced"
                                      ? "success"
                                      : journalBalance(journal) === "unbalanced"
                                        ? "danger"
                                        : "warning")
                                  }
                                >
                                  {journalBalance(journal)}
                                </span>
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={<FileJson size={23} />}
                    title="No journal evidence loaded"
                    detail="The authenticated balance is live. Import operator inspection JSON to view actual journal entries and a local debit-credit check."
                  />
                )}
              </section>
            </>
          )}

          {page === "workflows" && (
            <>
              <div className="metrics-grid metrics-three">
                <Metric
                  label="Submitted / session"
                  value={counts.submitted}
                  detail="Accepted for durable dispatch"
                  icon={<ArrowUpRight size={19} />}
                />
                <Metric
                  label="Processing / session"
                  value={counts.processing}
                  detail="Latest observed API state"
                  icon={<Clock3 size={19} />}
                />
                <Metric
                  label="Unresolved / session"
                  value={counts.unresolved}
                  detail="Needs reconciliation; never presumed declined"
                  icon={<CircleAlert size={19} />}
                  tone="warning"
                />
              </div>
              <section className="panel">
                <SectionHead
                  eyebrow="WORKFLOW OBSERVABILITY"
                  title="Observed payments and dispatch"
                  aside={
                    <a
                      href="http://127.0.0.1:8233"
                      target="_blank"
                      rel="noreferrer"
                      className="button button-secondary button-small"
                    >
                      Open local Temporal UI <ArrowUpRight size={14} />
                    </a>
                  }
                />
                {payments.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Payment</th>
                          <th>API status</th>
                          <th>Submission</th>
                          <th>Workflow ID</th>
                          <th>Dispatch evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((item) => {
                          const inspection = inspections.find(
                            (value) =>
                              value.payment.ID === item.payment.paymentId,
                          );
                          return (
                            <tr key={item.payment.paymentId}>
                              <td>
                                <button
                                  className="table-link"
                                  onClick={() => {
                                    setSelectedId(item.payment.paymentId);
                                    setPage("payments");
                                  }}
                                >
                                  {short(item.payment.paymentId)}
                                </button>
                              </td>
                              <td>
                                <Status status={item.payment.status} />
                              </td>
                              <td>
                                {item.submitted
                                  ? "Accepted this session"
                                  : "Not observed"}
                              </td>
                              <td>
                                <code>
                                  {inspection?.dispatch?.workflow_id ||
                                    (item.submitted
                                      ? "payflow-payment-" +
                                        item.payment.paymentId
                                      : "—")}
                                </code>
                                <small className="cell-sub">
                                  {inspection?.dispatch?.workflow_id
                                    ? "Operator evidence"
                                    : item.submitted
                                      ? "Expected ID pattern"
                                      : ""}
                                </small>
                              </td>
                              <td>
                                {inspection?.dispatch?.dispatched_at
                                  ? "Dispatched " +
                                    when(inspection.dispatch.dispatched_at)
                                  : "Not verified by operator file"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={<GitBranch size={23} />}
                    title="No workflow evidence yet"
                    detail="Submit a payment to observe its API state. Import operator inspection JSON on the Ledger page for durable dispatch details."
                  />
                )}
                <p className="panel-note">
                  Payment status comes from the API. A predictable workflow ID
                  is only an expected identifier until verified by operator
                  evidence or Temporal UI.
                </p>
              </section>
            </>
          )}

          {page === "infrastructure" && (
            <>
              <div className="metrics-grid metrics-three">
                <Metric
                  label="Go API"
                  value={
                    health.api === null
                      ? "Checking"
                      : health.api
                        ? "Online"
                        : "Unavailable"
                  }
                  detail="Loopback health probe"
                  icon={<HeartPulse size={19} />}
                />
                <Metric
                  label="Dependencies"
                  value={
                    health.dependencies === null
                      ? "Checking"
                      : health.dependencies
                        ? "Ready"
                        : "Unavailable"
                  }
                  detail="API readiness probe"
                  icon={<Database size={19} />}
                />
                <Metric
                  label="Temporal worker"
                  value={
                    health.worker === null
                      ? "Checking"
                      : health.worker
                        ? "Ready"
                        : "Unavailable"
                  }
                  detail="Worker readiness probe"
                  icon={<GitBranch size={19} />}
                />
              </div>
              <section className="panel">
                <SectionHead
                  eyebrow="RUNNING LOCALLY / OBSERVED HEALTH"
                  title="Local architecture"
                />
                <div className="architecture-flow">
                  <div className="architecture-node">
                    <div className="architecture-icon">
                      <Layers3 size={23} />
                    </div>
                    <strong>React dashboard</strong>
                    <small>Vite · 127.0.0.1:5173</small>
                  </div>
                  <ArrowRight className="architecture-arrow" size={20} />
                  <div className="architecture-node">
                    <div className="architecture-icon">
                      <Terminal size={23} />
                    </div>
                    <strong>Go ConnectRPC API</strong>
                    <small>127.0.0.1:8080</small>
                    <HealthBadge value={health.api} label="Health" />
                  </div>
                  <ArrowRight className="architecture-arrow" size={20} />
                  <div className="architecture-pair">
                    <div className="architecture-node">
                      <div className="architecture-icon">
                        <Database size={21} />
                      </div>
                      <strong>PostgreSQL</strong>
                      <small>Via API readiness</small>
                    </div>
                    <div className="architecture-node">
                      <div className="architecture-icon">
                        <GitBranch size={21} />
                      </div>
                      <strong>Temporal + worker</strong>
                      <small>Via readiness probes</small>
                    </div>
                  </div>
                </div>
                <p className="panel-note">
                  The browser does not connect to PostgreSQL or Temporal gRPC.
                  Readiness probes indicate dependency reachability through the
                  Go processes.
                </p>
              </section>
              <section className="panel planned-panel">
                <SectionHead
                  eyebrow="DEPLOYMENT DESIGN"
                  title="Infrastructure as Code — Not Deployed"
                  aside={
                    <span className="planned-tag">PLANNED / TERRAFORM</span>
                  }
                />
                <p className="panel-intro">
                  The repository documents a private AWS demonstration
                  architecture. This dashboard neither provisions nor checks AWS
                  resources.
                </p>
                <div className="planned-grid">
                  <div>
                    <Cloud size={20} />
                    <strong>ECS Fargate</strong>
                    <span>API and worker tasks</span>
                  </div>
                  <div>
                    <Database size={20} />
                    <strong>RDS PostgreSQL</strong>
                    <span>Multi-AZ database design</span>
                  </div>
                  <div>
                    <LockKeyhole size={20} />
                    <strong>Private access</strong>
                    <span>Internal HTTPS ALB and SSM path</span>
                  </div>
                  <div>
                    <Activity size={20} />
                    <strong>Observability</strong>
                    <span>CloudWatch and Temporal Cloud integration</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {page === "performance" && (
            <>
              <section className="panel">
                <SectionHead
                  eyebrow="LOCAL BENCHMARK EVIDENCE"
                  title="Import results"
                />
                <div className="performance-intro">
                  <p>
                    Load a PAYFLOW JSON report from the ignored{" "}
                    <code>results/loadtest</code> directory. Metrics are
                    displayed exactly from the file and remain in memory until
                    this tab closes.
                  </p>
                  <label className="button button-primary upload-button">
                    <FileJson size={15} />
                    Choose JSON result
                    <input
                      type="file"
                      accept=".json,application/json"
                      multiple
                      onChange={(event) => void importFiles(event, "benchmark")}
                    />
                  </label>
                </div>
              </section>
              {currentBenchmark ? (
                <>
                  <div className="benchmark-selector">
                    <span>EXPERIMENT</span>
                    <select
                      value={benchmarkIndex}
                      onChange={(event) =>
                        setBenchmarkIndex(Number(event.target.value))
                      }
                    >
                      {benchmarks.map((item, index) => (
                        <option key={item.date_utc} value={index}>
                          {item.test_name} · {when(item.date_utc)}
                        </option>
                      ))}
                    </select>
                    <span
                      className={
                        "status status-" +
                        (currentBenchmark.passed ? "success" : "danger")
                      }
                    >
                      {currentBenchmark.passed
                        ? "Reported pass"
                        : "Reported fail"}
                    </span>
                  </div>
                  <div className="metrics-grid metrics-four">
                    <Metric
                      label="Throughput"
                      value={currentBenchmark.requests_per_second.toFixed(1)}
                      detail="Requests / second"
                      icon={<Gauge size={19} />}
                      tone="accent"
                    />
                    <Metric
                      label="Total requests"
                      value={currentBenchmark.total_requests.toLocaleString()}
                      detail={
                        currentBenchmark.successful_requests.toLocaleString() +
                        " successful"
                      }
                      icon={<Activity size={19} />}
                    />
                    <Metric
                      label="API errors"
                      value={currentBenchmark.failed_requests.toLocaleString()}
                      detail="Failed HTTP requests"
                      icon={<CircleAlert size={19} />}
                      tone={
                        currentBenchmark.failed_requests ? "warning" : "success"
                      }
                    />
                    <Metric
                      label="Concurrency"
                      value={currentBenchmark.concurrency}
                      detail={
                        currentBenchmark.duration_seconds.toFixed(1) +
                        "s measured duration"
                      }
                      icon={<Layers3 size={19} />}
                    />
                  </div>
                  <div className="content-grid performance-grid">
                    <section className="panel">
                      <SectionHead
                        eyebrow="REQUEST LATENCY"
                        title="API response distribution"
                      />
                      <div className="latency-bars">
                        {(
                          [
                            ["P50", currentBenchmark.api_latency.median_ms],
                            ["P95", currentBenchmark.api_latency.p95_ms],
                            ["P99", currentBenchmark.api_latency.p99_ms],
                          ] as const
                        ).map(([label, value]) => (
                          <div className="latency-row" key={label}>
                            <span>{label}</span>
                            <div className="bar-track">
                              <div
                                style={{
                                  width:
                                    Math.max(
                                      1,
                                      (value /
                                        Math.max(
                                          currentBenchmark.api_latency.p99_ms,
                                          1,
                                        )) *
                                        100,
                                    ) + "%",
                                }}
                              />
                            </div>
                            <strong>{value.toFixed(1)} ms</strong>
                          </div>
                        ))}
                      </div>
                      <p className="panel-note">
                        Observed API percentiles from the selected local
                        benchmark file.
                      </p>
                    </section>
                    <section className="panel">
                      <SectionHead
                        eyebrow="FINANCIAL CHECK"
                        title="Invariant verification"
                      />
                      <div className="verification-result">
                        <span
                          className={
                            "verification-icon " +
                            (currentBenchmark.financial_invariants?.passed
                              ? "is-pass"
                              : "is-fail")
                          }
                        >
                          {currentBenchmark.financial_invariants?.passed ? (
                            <Check size={24} />
                          ) : (
                            <CircleAlert size={24} />
                          )}
                        </span>
                        <div>
                          <strong>
                            {currentBenchmark.financial_invariants
                              ? currentBenchmark.financial_invariants.passed
                                ? "Passed in report"
                                : "Failed in report"
                              : "Not reported"}
                          </strong>
                          <span>
                            {currentBenchmark.financial_invariants
                              ? currentBenchmark.financial_invariants
                                  .violation_count + " invariant violations"
                              : "No financial check in this file"}
                          </span>
                        </div>
                      </div>
                      <div className="verification-grid">
                        <div>
                          <span>Completed</span>
                          <strong>
                            {currentBenchmark.financial_invariants?.completed ??
                              "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Declined</span>
                          <strong>
                            {currentBenchmark.financial_invariants?.declined ??
                              "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Approval journals</span>
                          <strong>
                            {currentBenchmark.financial_invariants
                              ?.approval_journals ?? "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Pending submitted</span>
                          <strong>
                            {currentBenchmark.pending_submitted_payments ?? "—"}
                          </strong>
                        </div>
                      </div>
                    </section>
                  </div>
                  <section className="panel">
                    <SectionHead
                      eyebrow="PROCESSING LATENCY / SAMPLED"
                      title="Workflow measurements"
                    />
                    <div className="sample-grid">
                      {(
                        [
                          [
                            "Durable dispatch",
                            currentBenchmark.workflow_dispatch_latency,
                          ],
                          [
                            "Submission to terminal",
                            currentBenchmark.submission_to_terminal_latency,
                          ],
                          [
                            "Temporal execution",
                            currentBenchmark.temporal_workflow_execution_latency,
                          ],
                        ] as const
                      ).map(([label, item]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>
                            {item && item.count > 0
                              ? item.average_ms.toFixed(1) + " ms"
                              : "—"}
                          </strong>
                          <small>
                            {item ? item.count + " samples" : "Not measured"}
                          </small>
                        </div>
                      ))}
                    </div>
                    <p className="panel-note">
                      Experiment: {currentBenchmark.test_name} ·{" "}
                      {when(currentBenchmark.date_utc)} ·{" "}
                      {currentBenchmark.label}. Workflow samples and HTTP
                      requests have different populations.
                    </p>
                  </section>
                </>
              ) : (
                <section className="panel">
                  <Empty
                    icon={<FileJson size={24} />}
                    title="No benchmark result loaded"
                    detail="Choose an existing PAYFLOW JSON result to view measured throughput, latency, errors, and financial checks."
                  />
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

function PaymentTable({
  items,
  selectedId,
  onSelect,
}: {
  items: SessionPayment[];
  selectedId?: string;
  onSelect: (item: SessionPayment) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Payment ID</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.payment.paymentId}
              className={
                selectedId === item.payment.paymentId ? "row-selected" : ""
              }
            >
              <td>
                <button className="table-link" onClick={() => onSelect(item)}>
                  {short(item.payment.paymentId)}
                </button>
              </td>
              <td>{item.payment.merchantId}</td>
              <td className="amount-cell">{yen(item.payment.amount)}</td>
              <td>
                <Status status={item.payment.status} />
              </td>
              <td>{when(item.payment.createdAt)}</td>
              <td>
                <button
                  className="row-arrow"
                  onClick={() => onSelect(item)}
                  aria-label={"View payment " + item.payment.paymentId}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
