# BillResolve

Resolve questioned unpaid invoice lines through approved revisions.

## Status

This repository contains the initial product documentation. Application development has not started. There is no runnable application, measured benchmark or deployed service yet.

## Intended use

A freelancer's customer questions two line items on an unpaid invoice. BillResolve links each questioned item to supplied work evidence, asks for missing facts and creates a corrected invoice only after both sides approve the exact revision. It is ordinary invoice clarification, not a formal PayPal dispute or legal adjudication.

## Planned workflow

Import one authored unpaid Sandbox invoice and owned deliverable records → buyer questions a line → model links relevant evidence and identifies uncertainty → merchant edits proposed correction → buyer/merchant approve totals → cancel/supersede the unpaid invoice through supported API actions and issue the corrected one → buyer pays in Sandbox → provider read-back reconciles status. Prefer explicit supersession over silently editing disputed history. If provider status changed to paid, stop and ask for a separately reviewed workflow; no automatic refund.

## Development

Start with the behavior and boundaries in [Architecture](docs/architecture.md), then establish the fixtures and acceptance checks in [Verification plan](docs/verification-plan.md). Runtime versions, dependency installation, commands and deployment instructions will be added alongside working code. No installation command is available at this stage.

Keep credentials in local ignored files or the deployment secret store. Do not commit user data, provider tokens or private evaluation records.

## Development approach

The planned development approach is AI-assisted coding and ChatGPT-assisted research. This repository is a preparation foundation; implementation and application verification remain pending.

## License

Original application code and these documents use the [MIT license](LICENSE). Future dependencies, models, datasets and media retain their own licenses and must be reviewed before inclusion.
