# BillResolve

An evidence-led correction for a questioned unpaid invoice. Preserve the original, inspect supplied records, edit an exact revision, record both demo-role approvals, then cancel the unpaid original and issue the correction.

The local application is implemented and browser-verified. PayPal and evidence analysis default to labeled test doubles; live Sandbox transactions, real inference and public deployment remain pending. No real payment or invoice email occurs in local mode.

## Run

Use Node.js24. No runtime npm packages are needed.

```sh
node --test tests/*.test.mjs
node --env-file-if-exists=.env.local src/server.mjs
```

Open http://127.0.0.1:8803. Start the authored example, issue the local original, question the revision-session line, review its record, change quantity from two to one, prepare the $140 correction against the $180 original, record both exact approvals, and issue. Use the labeled local payment simulation to finish the receipt trail. SQLite state survives restart; export preserves the original and revision.

## Working boundaries

- AI can explain records and ask for missing facts. Citation IDs and quoted substrings are checked. Quote validation does not prove work was delivered or make every interpretation correct.
- Merchant edits own amounts. Integer USD cents, quantities and explicit tax rates determine totals. Tax is calculated per line before the invoice discount; no tax advice is offered.
- Question/revision changes clear approvals. Both approvals bind the original invoice ID, evidence, question and exact revision.
- Fresh provider status gates cancellation. Paid/partially paid controls refuse replacement; no automatic refund exists.
- Provider intent is saved before writes. An unresolved creation never repeats automatically or permits abandoning the active case. It needs Sandbox-account review. Cancellation and issuing require read-back.
- Sandbox transport uses a fixed origin, configured test merchant/buyer, suppressed email notifications and no production or mark-paid API. The buyer pays through PayPal; returned status and payment type are displayed separately.

Both demo roles share one private session; they are not separate authenticated people. The demonstrated scope uses three authored fictional service lines and one correction. Arbitrary invoice imports, multiple currencies, uploads, collection and notifications are excluded. The engine accepts up to ten lines. Explicit provider read-back replaces the initially proposed webhook inbox; no webhook delivery is claimed.

## Configuration and verification

Copy `.env.example` to ignored `.env.local`; keep credentials server-side. See [deployment](docs/deployment.md). Thirteen local tests cover amounts, evidence, approvals, transport fixtures, persistence, stale paid state, lost responses and request security. Actual browser checks exercised the complete local flow, reload and export. These are automated/browser-agent checks, not human reviews or live sponsor verification.

Built with AI-assisted coding and ChatGPT-assisted research. [Reuse and licenses](THIRD_PARTY_NOTICES.md). Original code: [MIT](LICENSE).

Sandbox provider controls and real AI calls require a private operator access code. Set `BILLRESOLVE_OPERATOR_CODE` to a unique random 32–256 character value. Sessions unlock for one hour; the public landing page contains no credentials. Local test mode works without the gate.
