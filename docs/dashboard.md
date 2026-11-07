# Local operations dashboard

The `web/` app is a local React/TypeScript/Vite view over PAYFLOW's existing Go ConnectRPC API. It does not deploy to AWS or move money. Use a synthetic merchant and the loopback development stack only.

## Requirements and startup (Windows PowerShell)

- Node.js 26 LTS (Node 22.12 or newer also satisfies Vite 8), npm, Go 1.27.2, Docker Desktop.
- From the repository root, start the existing local dependencies and migrate the database:

```powershell
docker compose up -d --wait
$env:DATABASE_URL = 'postgres://payflow:payflow@localhost:5432/payflow?sslmode=disable'
go run ./cmd/migrate
go run ./cmd/operator issues
```

If `operator issues` reports historical completed payments without journals, follow the [ledger upgrade instructions](../README.md#double-entry-ledger-and-upgrade) before starting the API and worker. For a new local merchant, create a development key and keep the output out of screenshots and files:

```powershell
go run ./cmd/credentials issue demo-merchant
```

Start each foreground process in its own PowerShell window. Set `DATABASE_URL` in the API and worker windows; PowerShell environment variables do not carry across windows.

```powershell
# API window
$env:DATABASE_URL = 'postgres://payflow:payflow@localhost:5432/payflow?sslmode=disable'
$env:PAYFLOW_ENABLE_DEV_PROCESSING = 'true'
go run ./cmd/api
```

```powershell
# Worker window
$env:DATABASE_URL = 'postgres://payflow:payflow@localhost:5432/payflow?sslmode=disable'
go run ./cmd/worker
```

```powershell
# Dashboard window, from repository root
Set-Location web
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite binds to loopback and proxies only the existing ConnectRPC methods and health routes to `127.0.0.1:8080`; the worker readiness proxy points to `127.0.0.1:9091`. Temporal Web UI is at `http://127.0.0.1:8233`. The dashboard's local link assumes these default ports.

Enter `demo-merchant` and the one-time `pfk_...` key in the connection form. The key remains in a React ref in this browser tab, is removed from the input after connection, and is cleared on Disconnect or reload. No credential goes to localStorage, sessionStorage, screenshots, or benchmark files. The merchant ID field is a session label; the Go API enforces the credential's actual merchant identity on every payment request. Use the ID paired with the key.

## Demonstration flow

1. On **Overview**, confirm the API, dependencies, and worker health probes report Ready. If a probe is unavailable, inspect the local Go process logs and Docker services.
2. On **Payments**, create a positive whole-yen JPY payment. Keep the generated idempotency key. Click **Replay create** on its detail panel to retrieve the same payment; changing the amount under that key produces the API's conflict.
3. Click **Submit payment** for server-selected simulated processing. The immediate response only confirms submission; the page polls `GetPayment` every three seconds for submitted nonterminal payments. Refresh manually at any time. For a deterministic local demonstration, select **Approve**, **Decline**, **Network timeout**, or **Lost approval response** under the development scenario control, using a fresh payment for each. These controls require `PAYFLOW_ENABLE_DEV_PROCESSING=true` and a loopback API listener.
4. On **Ledger**, refresh the authenticated merchant payable balance. An approved payment should post its journal and affect the balance; a decline or unresolved outcome should not. The session counts are separate from this account-wide API balance.
5. On **Workflows**, inspect observed API statuses. The ID pattern shown before operator import is explicitly an expected identifier, not proof of dispatch. Use the local Temporal UI for the actual execution history.
6. On **Performance**, select one or more existing JSON files from `results/loadtest/`. The dashboard does not include sample metrics; it displays values read from those local files.

### Import read-only operator evidence

The dashboard has no operator or database HTTP endpoint. Run the existing loopback-only CLI in a PowerShell window with `DATABASE_URL` set, and export only the fields needed for a screenshot. The original CLI output includes additional payment fields, so make a reduced file in ignored `results/`:

```powershell
$paymentId = '<payment UUID from the dashboard>'
$raw = go run ./cmd/operator inspect $paymentId | ConvertFrom-Json
$dispatch = $null
if ($raw.data.dispatch) {
  $dispatch = @{
    workflow_id = $raw.data.dispatch.workflow_id
    requested_at = $raw.data.dispatch.requested_at
    dispatched_at = $raw.data.dispatch.dispatched_at
  }
}
$safe = @{
  ok = $raw.ok
  data = @{
    payment = @{
      ID = $raw.data.payment.ID
      MerchantID = $raw.data.payment.MerchantID
      Status = $raw.data.payment.Status
    }
    dispatch = $dispatch
    journals = $raw.data.journals
  }
}
New-Item -ItemType Directory -Force results/dashboard | Out-Null
$safe | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 results/dashboard/inspection.json
```

Import that file on **Ledger**. The app checks its merchant ID against the connected session and checks each journal's debit and credit totals using integer arithmetic. It shows `unverifiable` when entries are missing or unsafe. A file import is evidence from a local CLI run, not a fresh database query from the browser.

## Screenshot preparation

- Use a 1440×900 or 1920×1080 desktop browser window. Capture Overview with health and recent synthetic payments, then Payments with a terminal approved and a declined example.
- Capture Ledger after refreshing the balance and importing a reduced operator inspection for an approved payment. Show its balanced journal status.
- Capture Workflows with a selected payment's API state, imported dispatch evidence, and a separate Temporal Web UI screenshot of the actual workflow.
- Import an existing JSON benchmark and capture Performance with its date, throughput, latency, errors, sample counts, and financial invariant result.
- Capture Infrastructure showing the local architecture and the exact label **Infrastructure as Code — Not Deployed**.
- Keep terminal windows showing issued keys, browser password fields, raw operator JSON, `.env`, and database URLs out of screenshots. Disconnect after capture.

## Data boundaries

Overview payment counts, Payments rows, and Workflow rows cover only records observed in the current browser tab. Refreshing clears them. The backend has no merchant payment-list endpoint, and the frontend does not claim account-wide payment history. The authenticated balance comes directly from `GetMerchantBalance`. Service health comes from actual loopback probes; a ready response is not an uptime metric. Workflow dispatch evidence requires an imported operator inspection. Performance metrics require actual PAYFLOW benchmark JSON. Planned Terraform resources are labeled as not deployed.

The frontend is intended for a trusted single-machine development session. It has no frontend user accounts or persistent local storage. Vite is a development server, not a production access layer.

## Verification

```powershell
Set-Location web
npm ci
npm run build
npm test
```

From the repository root, run `go test ./...` for backend regression checks. Live integration requires Docker Desktop, the local Compose services, the API, and the worker. When those are unavailable, UI unit tests and compilation do not establish live API behavior.
