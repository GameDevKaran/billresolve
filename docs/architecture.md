# BillResolve architecture

Native Node24 HTTP service, exact amount/domain functions, SQLite private sessions, generation-checked GCS adapter, isolated Sandbox Invoicing transport and constrained evidence model adapter. Vanilla JavaScript UI uses text nodes and no remote assets. ESM replaces the proposed TypeScript build to keep setup small.

Authored original → unpaid provider read-back → questioned line → cited evidence and missing facts → exact revision → both demo approvals → fresh unpaid check → confirmed cancellation → corrected draft → exact amount/line check → issue → buyer payment and explicit read-back.

The server owns provider IDs, operation stages and approval hashes. Private HttpOnly sessions, same-origin POST, payload limits, static allowlist, CSP and throttling are included. Both fictional roles operate in one session; no identity verification is implied.

Provider calls are not a database transaction. Each intent is persisted before writing. Lost draft responses lock automatic creation; known IDs permit read-back. A failed or racing cancellation cannot permit a replacement. Payment status/type is reported as returned; an externally recorded payment is not automatically called a PayPal capture.

Live Sandbox capability, AI quality, GCS runtime persistence and public release remain unverified. Local tests use deterministic provider doubles and controlled HTTP fixtures. No measured revenue, personal experience or production reliability claim is made.
