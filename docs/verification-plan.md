# BillResolve: verification plan

No tests or evaluations have run. The following are prospective acceptance targets, not results.

## Fixtures and acceptance

ten development and ten held-out invoice cases. All arithmetic and currency totals exact; zero invented deliverable evidence; every issued revision tied to its predecessor and approvals; all already-paid controls refuse unpaid-invoice mutation. ≥9/10 supported clarifications correctly identify relevant or missing evidence. Compare manually annotated invoice revision with the agent's correction count and review time. No claim about recovered revenue.

## Demonstration to verify

a challenged line, missing evidence recognized, an approved correction, old invoice visibly superseded, corrected Sandbox payment and provider status read-back.

## Result record

For each run, record the source commit, fixture version, runtime/provider versions, actual pass and failure counts, latency, cost where relevant, and limitations. Keep development and held-out inputs separate. Report negative findings; freeze the protocol before inspecting held-out results.

A release requires a functioning end-to-end workflow and a clean-session replay. Documentation, repository creation and HTTP availability alone do not establish application correctness.
