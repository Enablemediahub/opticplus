# Bealet HR Space

**Project reference:** Bealet HR Space (working name)
**Staff portal URL:** `https://opticplus.bealet.com/staff`
**Status:** Planning brief; requirements review pending
**Repository:** Opticplus

## Purpose

Build a secure employee self-service HR portal connected to Opticplus staff records and payroll. Employees sign in with their staff ID, see information and services permitted for their designation, and submit HR requests. The General Manager (GM) manages HR letters, KPI and allowance settings, and employee HR requests from an administrative workspace.

This document is the continuing project reference. Update its decisions, phase status, and acceptance criteria as work progresses.

## Source material and limits

- The request describes staff ID sign-in, a default PIN of `1234`, a role/designation-based dashboard, access to letters and downloadable PDFs, salary visibility, leave and excuse-duty submissions, medical reports, KPI-linked allowances configured by the GM, and GM control of HR-space content and figures.
- The supplied letterhead file is `LETTER HEAD BEALET.pdf`. It is a designed blank US Letter page; the header, contact information, divider, watermark, and footer are part of the page artwork.
- The supplied `HR DOCUMENTS.pdf` could not be found at `/Users/mindsurgeon/Documents/HR DOCUMENTS.pdf` during planning. HR document types, policies, approval steps, eligibility, and required content therefore remain to be extracted when the file is made available.
- The intended source for staff designation/profile records is the existing Opticplus staff profiles at `http://127.0.0.1:5173/#/staff-profiles`.

## Existing Opticplus foundation

Initial repository review found:

- Staff profiles are already managed through `employees_comprehensive`, including `staff_id`, `job_title`, department, salary and employee details.
- The Laravel API already has `/login`, manager employee routes, and payroll routes. Payroll has employee salary and allowance processing concepts.
- The existing staff profile interface notes whether an employee maps to a portal login, so linking employee records to user credentials is an area to design deliberately.
- Current main-app login and manager routes must not automatically grant employee users access to manager/admin capabilities. The portal needs server-side authorization and employee-scoped data access.

These are planning observations, not a claim that the existing login or payroll endpoints are ready for employee self-service.

## Proposed users and permissions

| User | Proposed access |
| --- | --- |
| Employee | Own profile summary, published letters, own payslips/salary information, leave and excuse-duty requests, and own medical-report submissions/status, subject to approved policy. |
| General Manager / authorized HR administrator | Manage HR templates and published letters, employee HR records, requests and decisions, KPI/allowance rules, and relevant HR settings. Changes should be auditable. |
| Payroll administrator (if distinct from GM) | Optional limited permission for payroll publishing and corrections. Confirm whether this role exists; the initial request reserves HR Space editing to the GM. |

Designation can tailor dashboard widgets, but it should not by itself grant access to another employee's private records or confidential salary data. Confirm the exact designation list and the access mapping from staff profiles.

## Proposed employee experience

1. Visit `/staff` and sign in with staff ID plus PIN/password.
2. On first sign-in, replace the temporary default PIN with a private credential. Provide reset/recovery through an authorized admin process.
3. See a role-aware dashboard with relevant HR notices, available letters, payroll summaries, requests, KPI/allowance information, and status updates.
4. Open and download published letters as PDFs rendered on the Bealet letterhead for printing and signing.
5. View own salary/payroll records and payslips only after the payroll period has been published/authorized.
6. Submit leave, excuse-duty, and medical-report requests/documents and follow their status. Required fields, attachments, and approvals will follow the HR Documents PDF once reviewed.

## Proposed GM / HR administration

- Manage/publish letter templates and employee-specific letters, with version history and a record of who changed or published each item.
- Set KPI definitions, review periods, targets, scoring rules, and any linked allowance calculations. Keep calculation inputs and approved outcomes visible to authorized staff; publish individual results to employees only when approved.
- Review, approve, reject, or request changes for employee submissions according to confirmed HR policy.
- Publish payroll/salary documents to the correct employee and period. Changes to salary and allowances must be permission-controlled and recorded.
- Use a clear audit trail for sensitive reads or changes where appropriate, including credential resets, salary changes, letter publication, KPI/allowance updates, and request decisions.

## Security and privacy requirements

- Treat `1234` only as a temporary onboarding PIN, never a permanent shared credential. Store only a strong password hash; require a change at first login; rate-limit sign-in and lock or slow repeated failures; avoid exposing whether a staff ID exists.
- Require staff ID uniqueness and a controlled link between an employee record and its portal identity. Deactivated employees must lose access promptly.
- Enforce authorization on the Laravel server for every employee-specific route. Derive the employee identity from the authenticated session/token, not from a client-supplied employee ID.
- Separate employee, GM/HR, and any payroll permissions. Apply least privilege and record sensitive administrative actions.
- Protect documents and medical data with private storage and authorized, expiring downloads; do not expose private files in public upload paths.
- Use HTTPS in production, secure session/token handling, CSRF protections where relevant, validation, safe file upload checks, and backup/retention policies.
- Agree on medical-data visibility and retention with Bealet before implementing. Medical reports should be restricted to staff who need them for the approved HR process.

## Technical direction

- Frontend: add a standalone `/staff` portal entry point/route that can share the existing React design system while keeping employee navigation and permissions separate from the manager workspace.
- Backend: extend the Laravel API with employee-authenticated HR endpoints and role/permission checks; reuse existing employee and payroll records after schema and endpoint review.
- Database: add purpose-built HR tables for portal credential linkage or account state, letters/templates, requests and approvals, attachments, KPI/allowance rules and results, and audit events as needed. Avoid duplicating staff identity or payroll facts without a migration plan.
- PDF letters: use the supplied letterhead artwork in a server-generated or otherwise reproducible PDF layout. Confirm page size, header/footer dimensions, fonts, margins, signature blocks, and whether generated letters may contain employee data before implementation.
- Deployment: configure the `opticplus.bealet.com/staff` path/subdomain routing, API origin, HTTPS, storage, and backups in the deployed environment. Local development currently uses the Opticplus frontend/API; production routing needs validation.

## Delivery phases

### Phase 0 — Requirements and source review

- Obtain and review `HR DOCUMENTS.pdf`.
- Visually inspect the letterhead and capture page/layout measurements and brand assets.
- Confirm designation values, employee/GM roles, approval flows, leave types, required forms, medical-document access, KPI rules, allowance formula, payroll publication rules, and retention requirements.
- Map existing staff IDs, employee records, portal users, salary/payroll data, and deployment routing.

**Exit criteria:** requirements and permissions matrix approved; data mapping and letter PDF specification documented.

### Phase 1 — Identity and portal foundation

- Establish employee account linkage to staff records and unique staff-ID sign-in.
- Create first-login PIN setup, credential reset, session handling, logout, rate limiting, and admin provisioning.
- Build the `/staff` shell, employee dashboard, and server-side employee-only access checks.

**Exit criteria:** an employee can sign in, change the temporary PIN, and access only their own basic profile; GM/admin routes remain protected.

**Started:** the working tree includes a separate staff portal account store and token namespace, staff ID/PIN sign-in, first-login password change, account lockout after repeated failed attempts, a GM-only account provisioning action in Staff Profiles, and the `/staff` portal shell. The first dashboard shows the employee's own profile summary. Staff accounts must be issued by the GM; provisioning sets the one-time temporary PIN `1234`. The local database migrations have been applied; the production database still needs the migrations.

### Phase 2 — Letters and PDF generation

- Add GM letter/template management, employee assignment, publication/revocation, and audit history.
- Generate downloadable print-ready PDFs using the approved Bealet letterhead.

**Exit criteria:** authorized employees can download only their published letters, and generated PDFs match the approved letterhead layout.

**Implemented in the working tree:** GM-only reusable letter templates, employee-, designation-, or all-staff letters, draft/publish/unpublish controls, employee placeholders, and employee-only published-letter access. The HR manual's 2027 employment renewal letter and six HR administrative letters are seeded as GM-editable templates. The manual is marked draft for Board approval, so these templates must be reviewed by the GM before use. Letter and payslip print views use the supplied Bealet letterhead design at its Letter page dimensions; staff can print or save as PDF.

The GM letter workspace includes a live Bealet-letterhead preview while drafting and a Preview action for saved letters. GM workspace tabs navigate to separate HR Space routes for letters, requests, leave tracking, staff directory and KPI/allowances.

### Phase 3 — Payroll self-service

- Add employee-scoped salary/payroll summaries and published payslips.
- Define payroll publishing/visibility rules and audit administrative corrections.

**Exit criteria:** employees see only authorized payroll data for their account and period.

**Implemented in the working tree:** the signed-in employee can see their current salary and up to 36 of their own existing payroll-history rows, with a print/save PDF payslip view. The current Opticplus payroll schema has no separate employee publication flag; visible rows are payroll records already processed into `payroll_history`.

### Phase 4 — Leave, excuse duty, and medical submissions

- Implement policy-defined forms, secure attachments, request status, notifications, and GM/HR decisions.

**Exit criteria:** submissions follow approved workflows and private attachments are accessible only to authorized users.

**Implemented in the working tree:** leave, excuse-duty and medical-report submissions use the forms in the supplied HR manual, with date/reason fields, handover details, notification date and optional PDF/image evidence. Staff can print/save a filled form or submitted request as PDF on the Bealet letterhead, and download attachments. Published letters and payslips also have print/save PDF actions. These use the browser print dialog; choose **Save as PDF** to download a PDF. Attachments remain on Laravel's non-public local disk and are served through employee-owned or GM-authorized endpoints.

Staff request entry includes a live letterhead preview. Each authenticated employee can upload, replace or delete one private reusable signature image; they choose whether to include it on form PDFs. The signature file stays on Laravel's non-public local disk and is returned only through the employee-authenticated API. Hostinger requires `database/manual_sql/staff_signature_upload.sql` before deploying the corresponding UI/API.

Annual leave tracking follows Bealet's stated minimum of 15 paid working days after 12 months' continuous service. Each employee has a year-specific entitlement, working-week schedule, carry-forward balance, approved and pending day totals, and available balance. The staff form calculates days from the selected dates, excludes Sundays and GM-entered public holidays, and blocks requests above the available balance. Sick/medical leave remains a separate type and does not consume annual leave. The GM can adjust an entitlement with a recorded note, enter public holidays, record normal remuneration when approving annual leave, and record urgent interruptions so unused days return to the balance. The GM view shows a 30-day notice reminder where applicable. Part-time schedules and any entitlement changes must be reviewed by the GM against current legal requirements; termination accrual remains a manual GM adjustment.

The Ghana Labour Act, 2003 (Act 651), sections 20, 22, 24–28, 30 and 31, is the reference for this workflow. The Act specifies 15 working days with full pay in a calendar year of continuous service and contains the protections described in the project notes. See the [Ministry of Employment and Labour Relations copy of Act 651](https://www.melr.gov.gh/files/publications/Labour_Act_-_2003.pdf). Confirm interpretation and part-time calculations with Ghanaian employment counsel before publishing the Staff Handbook.

### Phase 5 — KPI and allowances

- Implement GM-managed KPI periods, scoring and allowance rules, calculation review, approvals, and employee-visible results.
- Link approved allowance outcomes into payroll only after reconciliation rules are agreed.

**Exit criteria:** calculation examples are signed off and results can be traced from KPI inputs through approval to payroll.

**Implemented in the working tree:** the legacy KPI rules remain available for historical reference, and the new role-based framework adds editable role/branch scorecards, whole-number 0–5 ratings, weighted 100-point totals, manager-configurable payout bands, documented targets and evidence, and draft → approved → published assessments. Assessment criteria and allowance caps are snapshotted for the month; targets must be confirmed before approval. A General Manager’s own assessment requires independent approval. Employees can comment on published results, and the GM can respond. Starter allowance caps are GH₵0 until management configures approved values. Calculated allowances remain separate from payroll and are never posted automatically. The new schema is provided by migration `2026_11_19_000009_create_hr_kpi_scorecard_framework.php` and Hostinger SQL `database/manual_sql/hr_kpi_scorecard_framework.sql`.

### Phase 6 — Hardening and rollout

- Review authorization, privacy, backups, accessibility, mobile layout, error handling, and audit records.
- Pilot with selected staff; train GM/HR; deploy and monitor.

**Exit criteria:** pilot sign-off, production checks complete, recovery and support process documented.

**Implemented in the working tree:** staff sign-in is rate-limited and locks accounts after repeated failures; temporary credentials are hashed and must be changed; staff tokens are isolated and expire after eight hours; employee status is checked on each request; GM HR mutations use the existing audit middleware; medical/request attachments and uploaded letters stay on the non-public local disk; and staff/private attachment routes enforce employee or GM scope. The staff portal uses the Opticplus side-panel logo, branch dashboard hero image and staff profile photo, a blue design system, a dedicated GM-managed Staff Space wallpaper, and a responsive layout. The GM HR Space opens at `#/hr-space` as a full-screen page without the main sidebar, with a Back to Home action, employee thumbnails, global search, draft/template editing and deletion, letter uploads, request review, and KPI management. The private letter-upload migration is applied locally. The supplied letterhead PDF has been rendered as a high-resolution print background, and generated letters and payslips use its US Letter page size with reserved header/footer margins. Production upload, production migrations, visual checks, and pilot remain.

## Decisions to confirm during Phase 0

1. Confirm Board approval and effective date for the supplied 2027 HR manual before its draft policies and templates are used as official policy.
2. Confirm the secure channel/process the GM should use to distribute and reset temporary PINs.
3. Confirm the designation list and whether designations change dashboard content only or any permissions.
5. Confirm leave/excuse-duty types, approvers, required evidence, and status/notification expectations.
6. Confirm which medical report fields/documents are needed and who may view them.
7. Confirm the KPI period, formula, allowance rules, approval point, and how approved allowances flow into payroll.
8. Confirm whether payslips are already generated/stored and when they become visible to staff.
9. Confirm the expected retention period for private medical/request attachments.

## Initial acceptance criteria

- Staff can authenticate with their staff ID and an individualized credential, and first-login setup prevents continued use of the shared temporary PIN.
- An employee cannot access another employee's profile, letters, medical reports, requests, or payroll by changing request parameters.
- GM/HR can manage only the HR functions assigned to their role; sensitive changes have an audit record.
- Employees can view and download only published letters and payroll documents assigned to them.
- Leave, excuse-duty, and medical submissions preserve status and decision history.
- KPI/allowance outcomes are calculated from approved settings and do not silently alter payroll.
- Letter PDFs render on the approved Bealet letterhead and are legible when printed.
- The portal works at the production `/staff` URL over HTTPS and on common mobile and desktop layouts.

## Phase tracking

| Phase | Status | Notes |
| --- | --- | --- |
| 0 — Requirements and source review | In progress | HR manual and letterhead PDF reviewed; Board approval/effective date and several operational policy details remain to be confirmed. |
| 1 — Identity and portal foundation | In progress | Staff sign-in, account provisioning, password rotation, and basic profile dashboard are in the working tree; local migration applied, production migration and manual checks remain. |
| 2 — Letters and PDF generation | In progress | Role-aware delivery and the HR manual's GM-editable letter templates are in the working tree; print/save uses the supplied designed letterhead. Final print checks remain. |
| 3 — Payroll self-service | In progress | Employee-scoped salary/history views and payslip print/save view are in the working tree; local migration applied and payroll data review remains. |
| 4 — Leave, excuse duty, and medical submissions | In progress | Submission, private attachments, request history, and GM decisions are in the working tree; HR policy details remain pending. |
| 5 — KPI and allowances | In progress | Editable role-based scorecards, assessment evidence, independent GM approval, employee feedback and configurable payout bands are in the working tree; approved allowance caps and payroll reconciliation policy remain pending. |
| 6 — Hardening and rollout | In progress | Authorization and privacy controls are in the working tree; the letter attachment and role targeting migrations are applied locally. Production package/upload, production migrations, visual checks, and pilot remain. |
