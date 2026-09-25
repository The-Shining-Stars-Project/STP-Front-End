@AGENTS.md

# Shining Stars CRM — Frontend

Frontend for the Shining Stars Project CRM: an internal tool for a performing-arts non-profit
serving youth across programs (MJC, Manteca PT, Pathways). **Live in production and used daily.**
`PRODUCT.md` describes the users, tone, and design principles.

The API lives in a separate repo, `STP-BackEnd` (usually cloned next to this one). It has its
own `CLAUDE.md` covering entities, auth policies, and program scoping.

Stack: Next.js 16, React 19, TanStack Query, Tailwind CSS v4, TypeScript. As `AGENTS.md`
says, check `node_modules/next/dist/docs/` before relying on memory of Next APIs. For example,
route protection lives in `proxy.ts`, not `middleware.ts`.

## Production safety

- Pushing to `main` **auto-deploys to production** (`.github/workflows/main_shining-stars-crm-app.yml`).
  Commit or push only when asked.
- Space pushes about 20 minutes apart. An Azure OneDeploy that starts while the previous one
  is still applying fails with 409.
- Don't add `clean: true` or `type: zip` to the deploy step. It wiped `node_modules` and took
  the site down.
- `NEXT_PUBLIC_API_URL` is baked in at **build time** (the GitHub Actions build step env). The
  Azure app setting does nothing for the `/backend` rewrite.
- If a feature needs a backend migration or new endpoints, the API must be deployed first.
- This repo is public. No secrets in files.

## Vocabulary

- **Star** in the UI = `Participant` in API types. Never say "student", "client", or "case" in UI copy.
- **Sites = programs** in the client's language. `Site` in the API is a classroom location.
- Games = "Curriculum Resources", Scripts = "Scripts & Lesson Plans", the tracker grid =
  "Weekly Data".
- Program **Track** (`PartTime` | `Pathways`) decides the progress framework. Never branch on
  program slug; production slugs are unpredictable (`manteca-pt`, `pathways:-manteca`).

## Conventions

- Pages live in `app/(admin)/<area>/`, shared admin components in `app/(admin)/components/`,
  and app-wide components in `app/components/`.
- API calls go only through `lib/api/<area>.ts` → `lib/api/client.ts`, which calls
  `/backend/*`. `next.config.ts` rewrites that to the API, so auth cookies stay first-party.
  Response types live in `lib/types/api.ts` and must be kept in sync with backend DTOs by hand.
  Use `describeApiError` for user-facing error text.
- Reuse the existing helpers: `lib/starName`, `staffRoles`, `staffOptionLabel`,
  `attendanceStatus`, `tshirtSizes`, `programColor`, `format`, `linkify`, and the components
  `ProgramPills`, `StarStatusFilter`, `TierFilter`, `EmptyState`, `Skeleton`.
- `useAuth().canManage` mirrors the backend `ManagementWrite` policy. Hide controls the user
  can't use. A button that 403s silently has caused several "nothing happens" reports.
- `proxy.ts` `ADMIN_ONLY_PREFIXES` must match the Admin-only API endpoints.
- Modals never close on backdrop click (users lost typed data). Close with X, Cancel, or Escape.
- Any new iframe or embed needs a CSP entry in `next.config.ts`. `frame-src` was missing once
  and PDF previews rendered blank.
- No mock or demo fallbacks in production paths. Demo rows rendering in prod caused
  "Save does nothing" bugs twice.
- Program colors (MJC blue, Pathways teal, Manteca coral, Productions amber) come from each
  program's `colorHex` via `ProgramTheme`. Don't hardcode them.
- Accessibility: WCAG 2.1 AA. Color is never the only signal, and tap targets are at least 34px.

## Client rules that shape the UI

- Star documents and staff onboarding are **Admin-only**. Hide the widgets for everyone else.
- Delete is soft delete for stars and volunteers.
- Attendance: teachers mark Present/Absent and can submit. Only managers see Rescheduled /
  Not scheduled and can reopen a session.
- A teacher only sees their programs' stars. An empty screen for a teacher usually means an
  unlinked staff record, not a bug.

## Before handing work back

Run `npm run typecheck`, `npm run lint`, and `npm run build`. Some lint errors already exist on
main; don't add new ones.

## Debugging lessons

"Button does nothing": check `disabled` gating, silent 403s, and mock or demo rows before
anything else.
