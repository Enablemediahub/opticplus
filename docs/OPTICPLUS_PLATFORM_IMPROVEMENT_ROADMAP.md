# Opticplus: 10-Phase Improvement Plan

**Purpose:** An execution-ready roadmap for improving Opticplus as an optical-center operations platform. Each phase has a bounded scope, completion checks, and a copy-ready prompt for Copilot or Codex.

**Operating model:** The clinic primarily serves walk-in patients. Appointments are uncommon and must stay optional; never invent an appointment to make a walk-in fit the workflow.

**Deployment model:** Hostinger is live and is kept in sync with the local project using a staged package and FileZilla manifest. Treat production data and secrets as valuable. Do not claim to have changed or verified the live Hostinger site unless an authorized live connection/action was actually available.

## How to use this document

You can ask, for example:

> Work on phases 1 and 2 in `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md`. Follow the phase prompts, preserve existing data and unrelated changes, run the required checks, and report completed items and blockers.

Or:

> Work on phase 4 only. Do not start phase 5.

When multiple phases are requested, complete them in numerical order and respect their dependencies. Do not expand into later phases without permission. A phase may be split into smaller steps if production safety or a genuinely unresolved business decision requires it; explain the blocker rather than silently making a risky assumption.

## Execution contract for Copilot/Codex

Apply these instructions to every phase prompt below:

1. Read this roadmap and inspect the relevant code, tests, current worktree, and deployment scripts before changing anything.
2. Implement the phase in this repository; do not return only a proposal unless the phase explicitly requests an assessment or the user requests assessment only.
3. Keep changes surgical and within the selected phase. Preserve user changes and unrelated worktree modifications. Do not revert or overwrite unrelated files.
4. Do not access, alter, or claim to deploy to Hostinger without explicit authorized access and user approval. Prepare the local package/manifest only when requested or required by the selected phase.
5. Never expose or copy production `.env` values, VAPID private keys, patient data, or credentials into source, logs, documents, or deployment artifacts.
6. Do not delete production data, patient files, database tables, deployment snapshots, or broad directories. For cleanup, identify exact paths, verify they are generated and reproducible, and preserve rollback sources.
7. For schema/data work, provide a reviewed Laravel migration and, where Hostinger requires manual SQL, matching SQL and a backup/verification/rollback procedure. Do not run production migrations or SQL.
8. Test the actual behavior changed, not just compilation. Run the smallest relevant tests plus the production frontend build and applicable PHP checks. Report pre-existing failures separately from failures introduced by the work.
9. Update this roadmap only to mark completion notes or document a necessary decision; do not silently change the scope or acceptance criteria.
10. Finish with: files changed, behavior delivered, checks run/results, data/deployment steps still required, and anything deferred. Never report deployment as complete when only a local package was built.

## Phase 1 — Establish release safety and a known baseline

**Goal:** Make local changes and Hostinger releases traceable and recoverable before changing sensitive workflows.

**Scope**

- Inspect the current Git/worktree state, frontend build, backend source, package builder, staged Hostinger package, manifest, and deployment documentation.
- Document which local files are authoritative and which are generated output. Verify the package excludes local `.env`, secrets, logs, caches, and unrelated uploads.
- Define a release checklist covering verified database backup, upload/replace paths, manual deletions, optional SQL, post-upload smoke checks, and frontend rollback. Do not assume live Hostinger access.
- Fix only concrete release-script or documentation defects that are needed to make the checklist accurate. Do not rebuild/deploy unrelated features.

**Acceptance checks**

- A maintainer can identify the exact package build command and what its manifest means.
- Rollback preserves current production database state and known-good frontend assets.
- Secrets and patient data are excluded from release instructions and package outputs.
- Any discrepancy between local files, staged package, and the user's stated live baseline is reported, not silently reconciled.

**Copy-ready prompt**

> Implement Phase 1 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Inspect the worktree and Hostinger packaging scripts, package, manifest, and docs. Establish a safe, precise release/rollback checklist and fix only concrete packaging/documentation defects in scope. Do not contact or change Hostinger, do not modify production data, and do not clean unrelated artifacts. Verify package exclusions and manifest behavior, run relevant checks, and report any local/live parity that cannot be verified.

## Phase 2 — Protect private patient and clinical documents

**Goal:** Replace publicly addressable patient/clinical uploads with branch- and role-authorized access without losing existing files.

**Scope**

- Inventory patient uploads, medical reports, memo attachments/signatures, staff/profile images, and branding assets. Identify which files are private and which are intentionally public.
- Move private patient/clinical files to storage outside the public web root, or another repository-standard private storage location.
- Add authorized file delivery that verifies authentication, role, branch, patient ownership/scope, and document association.
- Update UI links, previews, and downloads to use authorized delivery.
- Preserve generated filenames, file type/size checks, useful audit events, and current authorized workflows.
- Plan a safe migration for existing production files: backup, copy/verify, switch references, test, retain old copies until verified. Do not execute production migration.

**Acceptance checks**

- Unauthenticated requests and users without branch/patient access cannot retrieve private files.
- Authorized staff can still view/download the correct file; filenames and supported file types remain usable.
- Automated tests cover access denied, cross-branch denied, authorized access, missing file, and invalid document reference.
- A Hostinger-specific storage/manual migration procedure is documented if required.

**Copy-ready prompt**

> Implement Phase 2 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Trace all patient/clinical document upload, URL, preview, and download paths. Move private documents out of public access and enforce authenticated role/branch/patient authorization on retrieval, preserving legitimate workflows and auditing. Add focused backend and frontend coverage. Do not delete or migrate live files or run production SQL; provide a verified backup/copy/switch/rollback procedure for Hostinger. Build and test the changed paths.

## Phase 3 — Create a meaningful regression-test foundation

**Goal:** Make critical optical-center workflows testable before larger workflow and cleanup changes.

**Scope**

- Replace or correct generic example tests that do not reflect the application's actual API/deployment behavior.
- Establish focused backend feature tests for login/token expiry, role permissions, branch boundaries, validation, and mutation audit behavior.
- Establish a minimal frontend test approach using compatible existing tooling; add tests for the highest-risk shared behaviors being changed, not a large test framework for its own sake.
- Add focused coverage for current prescription version selection, lens-order handoff/status, billing/payment/refund calculations, and approval transitions where existing test seams permit.
- Add or update CI checks only where the repository already has appropriate workflows or the phase can introduce them with minimal maintenance burden.

**Acceptance checks**

- Tests assert real application behavior and no longer rely on a meaningless `assertTrue(true)`.
- Known baseline failures are either corrected or clearly isolated and explained.
- Tests use safe test data and never depend on production credentials/data.
- Frontend build, lint where applicable, PHP syntax/style, and selected test suite produce a clear pass/fail result.

**Copy-ready prompt**

> Implement Phase 3 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Inspect existing test/config conventions, replace misleading example coverage with real tests, and add focused regression tests for authentication, branch/role access, audit behavior, and the most critical current prescription/order/payment workflows. Add only the minimum test tooling needed. Do not alter production behavior just to satisfy a test. Run the new tests and relevant builds; distinguish existing failures from new failures.

## Phase 4 — Specify the walk-in-first visit and queue workflow

**Goal:** Turn the real clinic's walk-in operation into a clear, implementable workflow contract before changing data models or screens.

**Scope**

- Trace the current receptionist intake, patient search, optometrist queue, patient form, prescription, billing, lens order, technician, pickup, and aftercare flows.
- Define a walk-in visit/encounter lifecycle separate from patient identity, prescription history, billing, and order fulfillment.
- Define how returning patients are found, how duplicate patient records are prevented, how visit reason(s) are captured, and how optional scheduled appointments join the same daily queue.
- Define which role owns each action and which branch scopes apply.
- Separate visit status from prescription, payment, insurance, and lens-order status. Recommend a small set of explicit state transitions and an audit/history model.
- Record any clinic-specific questions whose answers change schema or clinical policy. Do not invent clinical triage priorities or impose appointment requirements.

**Acceptance checks**

- A receptionist can describe the normal walk-in flow from arrival to handoff without entering an appointment.
- The flow handles new/returning patients, multiple services in one visit, no-purchase outcomes, prescription revisions, repairs, insurance, deposits, and pickup.
- A concise workflow contract and transition/role matrix are documented in the roadmap or an approved project doc.
- No production schema or UI is changed in this specification phase unless the user explicitly asks for a prototype.

**Copy-ready prompt**

> Complete Phase 4 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Trace existing patient and order workflows and produce a concrete walk-in-first workflow contract: entities, visit/queue states and transitions, role/branch permissions, optional appointment handling, prescription linkage, billing/order handoffs, audit history, and acceptance scenarios. Do not implement schema or UI yet. Do not add clinical triage rules. Use the existing code and clinic assumptions; list only decisions that truly require the user's input.

## Phase 5 — Implement the walk-in-first patient journey

**Goal:** Deliver the approved Phase 4 workflow in increments while keeping existing patient, prescription, and financial records intact.

**Dependencies:** Phase 4 workflow contract and Phase 3 regression tests. If the user requests Phase 5 without them, inspect first and report the minimum missing decisions before making irreversible schema choices.

**Scope**

- Add or adapt a visit/encounter/queue record so one patient can have multiple visits and one visit can cover multiple service reasons.
- Provide receptionist search/check-in with optional appointment data, branch-scoped live queue, arrival time, clear assignment and handoff actions.
- Provide optometrist queue access and link exam/prescription versions to the correct patient and visit without duplicating prescriptions.
- Connect the visit to existing billing, insurance, repairs, lens-order, technician, quality-check, and pickup records rather than duplicating those systems.
- Capture status changes, actor, timestamps, and cancellation/no-purchase outcomes.
- Preserve existing deep links and historical data; supply migration and Hostinger SQL plus backup/rollback instructions where necessary.

**Acceptance checks**

- New and returning walk-ins can move through reception → clinical handoff → selected next step → completion/pickup without appointment creation or duplicate patient data.
- Scheduled patients remain optional and join the same queue.
- Branch and role access is enforced on both client and server.
- Prescription version, billing/payment, and lens order associations are visible and testable.
- Migration/backfill and Hostinger instructions are reviewed; production operations remain unexecuted.

**Copy-ready prompt**

> Implement Phase 5 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md`, following the approved Phase 4 workflow contract. Build the walk-in check-in and queue through clinical handoff and existing billing/order/pickup workflows. Keep appointments optional, keep visit status separate from payment/order/prescription status, preserve old records and links, and enforce role/branch authorization server-side. Add migrations plus matching Hostinger SQL and rollback guidance if schema changes are necessary. Add tests for the acceptance scenarios. Do not run production SQL or claim a Hostinger deployment.

## Phase 6 — Standardize action buttons and interaction behavior

**Goal:** Make common actions predictable, accessible, and safe across the application.

**Scope**

- Inventory existing buttons/icons and define reusable visual variants for primary, neutral, positive/workflow, destructive, and overflow actions.
- Reuse existing icon infrastructure. Standardize names, size, spacing, focus/hover/disabled/loading states, and mobile behavior.
- Standardize action ordering and verbs: view, edit, workflow action, then destructive action; use “Delete,” “Approve,” “Reject,” “Mark ready,” and “Mark collected” consistently where semantically correct.
- Standardize confirmation for irreversible actions, accessible names/tooltips, double-submit prevention, success updates, and explicit error reporting.
- Pilot shared components on a small, representative set of patient, prescription/order, and finance screens; expand only after verifying no behavior/permission regressions.

**Acceptance checks**

- Equivalent actions share consistent appearance, wording, placement, confirmation, loading, success, and error behavior.
- Icon-only controls have accessible names and tooltips; color is never the sole meaning.
- Destructive actions cannot be mistaken for primary actions and preserve audit/soft-delete behavior where required.
- Role-specific visibility and current action semantics are unchanged.

**Copy-ready prompt**

> Implement Phase 6 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Inventory current action controls, define reusable accessible button/icon patterns, and apply them to a representative patient, prescription/order, and finance workflow. Keep action semantics, role permissions, audit behavior, and data changes intact. Standardize labels, ordering, confirmations, loading, success, and explicit errors. Add focused checks and report remaining screens that should be migrated later; do not perform an unbounded whole-app redesign.

## Phase 7 — Review navigation and consolidate verified duplication

**Goal:** Reduce confusion among overlapping screens without removing a function staff still needs.

**Scope**

- Map related areas: Patients/Patient Management/Patient Records; Lens Orders/Lens Tracker/Prescription Reference; Finance/Sales/Revenue Tracking/The Monitor/Reports/Extract; Inventory/Product Tracker/BSMI.
- Determine each screen's audience, task, data owner, permissions, exports, and current use from code and available evidence. Ask the user/staff only for usage facts that cannot be determined safely.
- Identify repeated forms, filters, date ranges, status labels, search behavior, and duplicate entry.
- Recommend canonical destinations and contextual links/tabs. Implement only consolidations with equivalent behavior and clear acceptance.
- Preserve old deep links and API routes during transition; remove aliases only with evidence, tests, and a deprecation plan.

**Acceptance checks**

- Every navigation item has a distinct audience/task or an explicitly documented compatibility purpose.
- No needed action, permission, report, or export is lost.
- Duplicate data-entry steps are reduced where safely possible.
- Existing hashes/routes continue to work or have tested redirects.

**Copy-ready prompt**

> Implement Phase 7 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Map related screens, roles, routes, data ownership, and repeated interactions. Use code and available usage evidence; do not assume similarly named screens are redundant. Consolidate only verified overlap, preserve permissions/exports/deep links, add regression tests, and document anything that needs staff confirmation rather than deleting it.

## Phase 8 — Refactor frontend structure and improve load performance

**Goal:** Make the frontend easier to maintain and faster to load without a risky rewrite.

**Scope**

- Extract one cohesive area at a time from the large app entry file into role-aware shell, navigation, route/view, or feature modules consistent with repository patterns.
- Split the large stylesheet by feature/component while preserving shared design tokens, theme behavior, and existing responsive layouts.
- Extract repeated filters, date ranges, pagination, status badges, confirmations, and action controls only when tests and multiple real usages justify a shared component.
- Add route/view-level code splitting where it measurably reduces initial load; do not split solely to satisfy a bundle warning.
- Preserve URLs, role menus, session restore, browser history, and current layouts; add targeted tests and perform desktop/mobile visual checks.

**Acceptance checks**

- Each extracted feature has a clear boundary and no hidden data/permission change.
- Deep links, session restore, role-specific navigation, and responsive layouts still work.
- Initial bundle/load performance is measured before and after the change.
- Build and relevant lint/tests pass; pre-existing lint issues are identified separately.

**Copy-ready prompt**

> Implement Phase 8 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Refactor one or more bounded frontend areas to reduce app-entry/style coupling and, where measured, initial bundle cost. Follow local patterns, preserve all view hashes, role permissions, session restore, themes, and responsive behavior. Add or use focused tests and provide before/after build-size evidence. Do not rewrite the app shell or broadly reformat unrelated CSS.

## Phase 9 — Clarify backend boundaries and make schema evolution explicit

**Goal:** Reduce request-time schema work and controller complexity while keeping Hostinger-compatible, reviewable database changes.

**Scope**

- Inventory tables/columns created or altered inside requests, legacy-schema compatibility helpers, large controllers, transactions, and repeated validation/authorization logic.
- Move schema evolution to versioned Laravel migrations and provide equivalent, idempotent/manual-reviewed Hostinger SQL when needed.
- Move cohesive controller responsibilities into services/actions/form requests only where boundaries reduce complexity and preserve transaction/authorization semantics.
- Verify indexes and query behavior for patient search, queue, billing, orders, and reports using representative query plans or available test data.
- Keep cache behavior, error reporting, audit trails, and financial precision explicit.
- Document deployment order and rollback limitations for non-reversible data migrations.

**Acceptance checks**

- Normal HTTP requests do not create or alter schema.
- Each schema change has a migration, matching Hostinger procedure if needed, backup/backfill verification, and clear rollback limitations.
- Authorization and transaction behavior is covered by tests.
- No broad controller rewrite or speculative schema normalization occurs.

**Copy-ready prompt**

> Implement Phase 9 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Inventory runtime DDL and select a bounded, high-value area to migrate to explicit versioned migrations with matching Hostinger SQL. Refactor backend controller/service boundaries only when it reduces a clearly identified responsibility hotspot. Preserve authorization, transactions, audit logs, MySQL compatibility, and financial precision. Add tests and deploy/rollback instructions. Never run schema changes on Hostinger.

## Phase 10 — Clean generated artifacts and finish operational hardening

**Goal:** Leave a reproducible repository and a maintainable release process after high-risk workflows are protected.

**Scope**

- Inventory generated `dist*` folders, old package snapshots, temporary diagnostics, logs/PIDs, and unrelated project materials. Classify source, active output, rollback copies, and safe-to-remove generated artifacts.
- Recommend exact cleanup candidates and retention rules. Delete only specifically verified, reproducible in-scope artifacts; retain current package, any required rollback assets, uploads, credentials, source, and user data.
- Update ignore rules for reproducible local outputs only; do not hide deployment inputs or needed Hostinger staging files.
- Add or complete small operational checks for API health, storage writability, stale queue/order data, failed notifications, upload failures, and package/manifest consistency without leaking personal or sensitive data.
- Confirm final build/test/release instructions and update the package only if requested or if the selected scope explicitly includes a release.

**Acceptance checks**

- Cleanup targets are listed and verified before deletion; active source and rollback artifacts remain.
- Build can be recreated from source and package output is not confused with source.
- Operational errors are visible to maintainers with useful, privacy-safe messages.
- Final build/tests pass, package/manifest references are internally consistent if regenerated, and release status is accurately reported.

**Copy-ready prompt**

> Implement Phase 10 from `docs/OPTICPLUS_PLATFORM_IMPROVEMENT_ROADMAP.md` only. Inventory generated builds, package snapshots, temporary files, runtime logs, and unrelated materials; classify them before cleanup. Remove only exact, verified, reproducible artifacts within scope, preserving source, user data, Hostinger staging, secrets, and rollback assets. Improve minimal operational checks/documentation where needed. Verify a clean build and package/manifest consistency if packaging is included. Do not use broad recursive deletion and do not claim live deployment.

## Cross-phase release checklist

For each implementation phase:

- [ ] Confirm scope and dependencies; inspect current worktree and preserve unrelated changes.
- [ ] Run targeted tests, production frontend build, and applicable PHP syntax/style/tests.
- [ ] Check relevant roles, branch boundaries, loading/empty/error states, and mobile/tablet behavior.
- [ ] Back up data before any production schema/data operation; do not run production operations as part of local implementation.
- [ ] Prepare the Hostinger package/manifest only when requested or in scope; include only changed files and exact stale asset deletions.
- [ ] Verify uploaded behavior on the live site only when the user has authorized access and a real verification path is available.
- [ ] Retain known-good frontend assets and record the actual outcome, unresolved blockers, and required manual Hostinger steps.

## Measures of improvement

Track relevant baselines before and after implementation:

- Walk-in registration time and duplicate patient-record count.
- Check-in-to-optometrist handoff time and queue items with unclear ownership.
- Lens orders linked to the intended prescription version and time to ready/collected.
- Payment/refund corrections and insurance reconciliation exceptions.
- Unauthorized document retrieval attempts and successful authorized downloads.
- Release failure/rollback frequency and time to identify the deployed package version.
- Staff-reported time to find common actions and repeated data entry across screens.
- Initial frontend transfer size and time to usable dashboard on a representative mobile connection.

These measures are for improving systems and patient service, not evaluating individual clinical performance.
