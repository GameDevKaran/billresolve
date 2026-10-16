# BillResolve: architecture

Proposed design; no components have been implemented.

Import one authored unpaid Sandbox invoice and owned deliverable records → buyer questions a line → model links relevant evidence and identifies uncertainty → merchant edits proposed correction → buyer/merchant approve totals → cancel/supersede the unpaid invoice through supported API actions and issue the corrected one → buyer pays in Sandbox → provider read-back reconciles status. Prefer explicit supersession over silently editing disputed history. If provider status changed to paid, stop and ask for a separately reviewed workflow; no automatic refund.

TypeScript portal, model extraction, deterministic decimal totals, PayPal Invoicing adapter and append-only revision ledger. Support one merchant, one currency, ten line items and explicit taxes/discounts supplied by the user. Exclude tax advice, legal enforcement, debt collection, escrow, real email recipients and production invoicing. Sandbox delivery targets only the test accounts.

## Failure handling and data boundaries

Preserve original inputs and make unavailable evidence explicit. Provider failures must return a visible unresolved state. Decisions that change user or provider state need the confirmation specified above. Record source versions and operation identifiers without exposing credentials.

## Implementation record

Add pinned dependencies, actual component boundaries and operational instructions when the first working slice exists. Document departures from this design with their reason; do not describe planned integrations as verified.
