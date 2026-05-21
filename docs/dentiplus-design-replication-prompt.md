# Dentiplus Design Replication Prompt

Use this prompt to recreate the **design system and user experience style** of Opticplus for a new dental-management platform called **Dentiplus**.

Important: replicate **design patterns, shell behavior, layout language, responsiveness, and interface polish only**. Do **not** copy Opticplus business logic, optical workflows, naming, or database tables unless they are explicitly redefined for Dentiplus.

## Prompt

Build a new multi-user dental management platform called **Dentiplus** using:

- Frontend: **React + Vite**
- Backend/API: **PHP/Laravel-style API with MySQL**
- Authentication: token/session-based login with persistent session restore
- Database: **MySQL**
- Existing source schema: **use the provided `u363431941_edental` SQL schema as the database foundation**

The platform should feel like a **design sibling** of Opticplus, not a clone of its business domain. Recreate the same **visual quality, shell structure, UI density, login experience, sidebar behavior, header behavior, dashboard hierarchy, and footer treatment**, while adapting the workflows and terminology to dental management.

## Schema Instruction

Use the attached/provided SQL dump `u363431941_edental (1).sql` as the primary schema source of truth for Dentiplus.

- Do not invent an entirely new schema if the existing table already supports the workflow
- Reuse and build around the current schema structure first
- Add migrations or extensions only where necessary for the new React + Vite + API architecture
- Keep existing relationships intact unless there is a strong implementation reason to normalize or extend them
- Respect current foreign-key relationships and entity boundaries

The implementation should be designed around the existing database tables such as:

- `users`
- `staff`
- `staff_branches`
- `appointments`
- `patients`
- `patient_assignments`
- `clinical_details`
- `medical_records`
- `prescriptions`
- `procedures`
- `billing_records`
- `payments`
- `payments_new`
- `receipts`
- `refunds`
- `expenses`
- `health_insurance`
- `conversations`
- `conversation_participants`
- `messages`
- `message_reads`
- `message_templates`
- `settings`
- `sessions`

Treat this as a real operational dental schema, not a mock schema.

## Core Direction

Replicate only the **design language** of Opticplus:

- Full-height app shell with a **fixed left sidebar** and **independent main-content scrolling**
- Premium admin-portal look with **rounded glass/neomorphic panels**, polished gradients, layered shadows, and strong visual hierarchy
- A **hero-style header area** at the top of the dashboard/content views
- A branded **login interface** with wallpaper/hero art, strong identity block, and clean sign-in card
- A visible **session restore interface** that appears while checking stored authentication state
- A **responsive mobile/tablet drawer sidebar** that slides in from the left and closes on overlay tap or navigation
- A consistent **footer/credit area**
- A modern, professional, management-focused UI that feels operational, dense, and polished rather than generic CRUD

Do not make the experience minimalist in a bland way. Keep it elegant, structured, and dashboard-driven like Opticplus.

## Brand Conversion

Convert the branding from Opticplus to Dentiplus:

- Product name: **Dentiplus**
- Domain theme: dental management
- Replace optical language with dental language everywhere
- Keep the overall shell architecture and visual rhythm similar
- Keep branding areas ready for logos, clinic name, tagline, and optional wallpaper uploads

## User Roles

The system must support these roles and give each one a role-aware dashboard and sidebar:

- **Receptionist**
- **Dentist**
- **Accountant**
- **Admin**

Role mapping should align to the provided schema wherever possible:

- Use existing `users` / `staff` records as the authentication and staff identity backbone
- Preserve `Dentist` and `Receptionist` as first-class roles already present in the schema
- Support `Accountant` in the portal even if the current schema may require extension in the auth/user-role layer
- Use `Admin` as the main management role for Dentiplus, even if older schema samples also contain `superadmin` or other legacy role labels
- Ignore unrelated legacy roles in the UI if they are not needed for Dentiplus

Each role should inherit the same overall shell design, but the menu structure, dashboard widgets, quick actions, and header copy must reflect the role.

## Layout Requirements

### 1. Main App Shell

Recreate the Opticplus-style application shell:

- Left sidebar permanently visible on desktop
- Sidebar contains:
  - brand/logo area
  - portal descriptor/subtitle
  - grouped navigation sections
  - active navigation state with premium highlighted treatment
  - signed-in user panel near the bottom
  - sign-out action inside the sidebar
- Main area contains:
  - top header/hero block
  - page content below
  - smooth content spacing with wide readable panels
- Sidebar and main content should scroll independently where appropriate
- Use `100vh`-style fixed-height shell behavior

### 2. Sidebar Behavior

The sidebar should closely match the Opticplus feel:

- Rounded container, premium shadowing, layered surfaces
- Strong active-state treatment for current page
- Group related navigation items under section headings
- Clear icon + label button structure
- Mobile behavior:
  - hidden by default on small screens
  - opens with a menu toggle in the header
  - closes with overlay click, close button, or item selection
- Sidebar must remain highly usable on smartphone and tablet

### 3. Header / Hero Area

Recreate the same top-of-page experience:

- A dashboard hero/header panel with rounded corners and wallpaper/gradient background
- Greeting area with user name, role, and branch or clinic context if relevant
- Space for role-aware summary text
- Action area on the right for profile, branch context, or key controls
- The header should feel like a visual anchor for each workspace, not a thin utility bar

### 4. Footer

Include a footer treatment similar in spirit to Opticplus:

- Small but visible credit/footer area
- Consistent across login and app views
- Should feel integrated into the brand rather than appended as an afterthought

## Login Interface Requirements

Recreate the Opticplus-style login experience for Dentiplus:

- Split or dual-surface composition:
  - one side or panel for brand/wallpaper/identity
  - one side or panel for the sign-in form
- Support a configurable login wallpaper or branded background image
- Show Dentiplus product branding prominently
- Keep the login form minimal, polished, and operational
- Include:
  - username/email field
  - password field
  - show/hide password toggle
  - sign-in button
  - clean validation error area
- Avoid demo credentials tiles or gimmicky onboarding clutter
- The login page should feel secure, premium, and modern

## Session Restore Experience

Replicate the Opticplus session-persistence behavior and interface:

- Persist authentication token locally
- On app boot, attempt to restore the session before showing the login screen
- During restore, show a dedicated branded loading state such as:
  - logo
  - “Restoring your session”
  - a short line about checking the API and stored token
- This state should feel intentional and designed, not like a generic spinner page

## Dashboard Requirements

Create role-based dashboards that follow the same design principles as Opticplus:

### Receptionist Dashboard

- Quick operational view
- Today’s appointments
- Patient check-in / queue summary
- New patient registration shortcuts
- Billing or payment handoff indicators
- Compact but high-clarity widgets

### Dentist Dashboard

- Clinical work focus
- Today’s appointments / procedure schedule
- Patient treatment queue
- Treatment notes / records shortcuts
- Outstanding follow-ups
- A workspace feel similar to a professional medical dashboard

### Accountant Dashboard

- Financial overview
- Revenue and collections summary
- Expense and receivables/payables visibility
- Reports shortcuts
- Wide readable finance panels instead of cramped generic cards

### Admin Dashboard

- Cross-platform operational summary
- Staff/users overview
- Clinic activity snapshot
- Settings / permissions / system controls
- Highest-level monitoring dashboard

Each dashboard should look like it belongs to the same system, with shared components, but each role must feel purpose-built.

## Navigation Suggestions

Use the Opticplus-style grouped navigation approach, but adapt it for Dentiplus. Suggested sections:

### Receptionist

- Dashboard
- Appointments
- Patients
- Check-In
- Billing
- Messages / Notifications

### Dentist

- Dashboard
- Appointments
- Patients
- Treatment Notes
- Procedures
- Prescriptions / Recommendations

### Accountant

- Dashboard
- Revenue
- Payments
- Expenses
- Reports
- Financial Ledger

### Admin

- Dashboard
- Users
- Staff
- Patients
- Billing
- Reports
- Settings
- Audit / Activity

These are only structure suggestions. Preserve the design organization more than the exact labels.

## UI Style Rules

Match the Opticplus visual personality:

- Rounded panels and containers
- Premium shadows with layered depth
- Subtle glassmorphism or neumorphic influence
- Rich gradients, especially in hero/header and login areas
- Strong dark/light theme readiness
- Clear hierarchy between shell, cards, sections, tables, and forms
- Dense but readable workspace layouts
- Professionally styled inputs, not raw browser-like fields
- Tables, cards, filters, and forms should all feel part of one design system

Do not turn Dentiplus into:

- a generic bootstrap admin
- a plain CRUD dashboard
- a flat single-color interface
- an overly animated or flashy UI

Animations should be restrained and purposeful.

## Component Expectations

Include reusable components modeled after the Opticplus design approach:

- App shell
- Sidebar
- Sidebar nav item
- Mobile sidebar drawer
- Header hero
- Stat widget cards
- Filter bars
- Data tables
- Form panels
- Modal/dialog surfaces
- Profile chip/user summary block
- Footer credit component
- Session restore screen
- Login screen

## Responsiveness

The Dentiplus design must be responsive in the same spirit as Opticplus:

- Desktop: fixed sidebar + roomy dashboard layout
- Tablet: drawer-style navigation with preserved hierarchy
- Mobile: accessible sidebar toggle, readable cards, controlled spacing, touch-friendly actions
- No broken overflow, clipped cards, or hidden sign-out behavior on mobile

## Technical Expectations

Build the project structure in the style of a modern React + Vite frontend connected to a MySQL-backed API:

- React for the frontend shell and role-based portal views
- Vite for frontend tooling
- MySQL for persistent data
- Token-based authentication with persisted login state
- Clear separation between:
  - auth/login screens
  - boot/session restore state
  - authenticated portal shell
  - role-based content sections
- Backend endpoints and services should be built around the provided eDental schema instead of a newly invented domain model

## Data-Aware Module Direction

Design the frontend modules so they map naturally onto the provided schema:

- Appointments workspace should center on `appointments`
- Patient management should center on `patients`
- Clinical workflow should use `clinical_details`, `medical_records`, and `prescriptions`
- Procedure and treatment charging should use `procedures` and `billing_records`
- Payment and receipt flows should use `payments`, `payments_new`, `receipts`, and `refunds`
- Accountant reporting should use `billing_records`, `payments`, `expenses`, and insurance-related tables
- Insurance workflows should use `health_insurance`
- Internal communication can build on `conversations`, `conversation_participants`, `messages`, `message_reads`, and `message_templates`
- Settings and login/session management should respect `settings`, `users`, `staff`, and `sessions`

## Important Guardrails

- Replicate **design only**, not Opticplus domain logic
- Replace all eye/optical wording with dental terminology
- Keep the **same quality of shell design**, not the exact module set
- Use the provided `u363431941_edental` schema as the backend base instead of replacing it with a speculative new schema
- Preserve the **feel** of:
  - the sidebar
  - the dashboard hierarchy
  - the header hero
  - the login interface
  - the session restore screen
  - the footer
- Ensure each role has its own logical dashboard and menu
- Make the final result feel like **Dentiplus was built by the same team that designed Opticplus**

## Output Request

Generate:

1. A React + Vite frontend shell for Dentiplus
2. A reusable design system/CSS structure inspired by Opticplus
3. A branded login page
4. A branded session-restore screen
5. A fixed desktop sidebar and mobile drawer sidebar
6. Role-based dashboards for Receptionist, Dentist, Accountant, and Admin
7. Header, footer, profile, and navigation components that share one visual language
8. MySQL-ready backend/auth structure for multi-user dental management

The final outcome should look like **Dentiplus**, but anyone familiar with Opticplus should immediately recognize that the **design DNA** came from the same product family.
