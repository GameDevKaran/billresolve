# Isolated release configuration

Prepared configuration only; no cloud resources or costs have been authorized for BillResolve.

Use only GCP `tough-melody-508008-p8`, region `us-central1`, independent Cloud Run service `billresolve`, private bucket `billresolve-sessions-564976398462`, dedicated runtime/build identities, image registry `billresolve-images` and app-specific Secret Manager secrets. Preserve existing apps. Minimum0/maximum1 instances,512MiB,concurrency8; no Cloud SQL or custom domain. Resolve and pin the base-image digest when an actual build is authorized.

Set `BILLRESOLVE_PAYPAL_MODE=sandbox`, `BILLRESOLVE_STORE=gcs`, exact HTTPS `BILLRESOLVE_ORIGIN`, authorized project and isolated bucket. Runtime identity gets object access only to this bucket and access only to its secrets. Image context excludes private records and tests.

Secrets: Sandbox client/secret and configured test merchant/buyer references; model key. Model mode requires provider/model, explicit approval reference, expiry and durable request limit. Default request limit0 prevents inference. Existing app allowances cannot be transferred.

Release gate: actual Sandbox original draft/issue, cancellation/read-back, corrected exact invoice and buyer payment; verify returned payment method/type; real bounded AI evidence output; GCS stale writes and restart; public HTTPS session, refusal paths, export and a live demo. No arbitrary recipients or production API access.

Official references: [Invoicing](https://developer.paypal.com/api/invoicing/v2), [issue without email](https://developer.paypal.com/api/invoicing/v2/invoices-send), [cancel sent invoice](https://developer.paypal.com/api/invoicing/v2/invoices-cancel). No webhook integration is advertised in this release scope; explicit GET reconciliation owns status.
