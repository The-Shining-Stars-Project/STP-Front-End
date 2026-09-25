# Shining Stars CRM — Frontend

Next.js frontend for the Shining Stars Project CRM. The API is in
[`STP-BackEnd`](https://github.com/The-Shining-Stars-Project/STP-BackEnd). See `PRODUCT.md` for
users, tone, and design principles.

| Concern   | Technology                        |
|-----------|-----------------------------------|
| Framework | Next.js 16 (App Router), React 19 |
| Data      | TanStack Query                    |
| Styling   | Tailwind CSS v4                   |
| Language  | TypeScript                        |

## Project structure

```
STP-FrontEnd/
├── app/
│   ├── page.tsx              # Sign-in
│   ├── (admin)/              # Every signed-in page: dashboard, students (stars), attendance,
│   │   │                     # tracker, planning, roster, programs, staff, users, reports, ...
│   │   └── components/       # Shared admin components (modals, filters, widgets)
│   └── components/           # App-wide components (sidebar, program theming)
├── lib/
│   ├── api/                  # One module per API area; client.ts is the fetch wrapper
│   ├── auth/                 # AuthProvider, AuthGuard
│   └── types/api.ts          # Response types, kept in sync with the backend DTOs
├── proxy.ts                  # Route protection and admin-only page gating
└── next.config.ts            # /backend rewrite to the API, security headers and CSP
```

The browser never calls the API directly. Every request goes to `/backend/*` on this app's own
origin, and `next.config.ts` rewrites it to `NEXT_PUBLIC_API_URL`. That keeps the httpOnly
auth cookies first-party.

## Running locally

Prerequisites: Node.js 20+, and the API running locally (see the backend README).

```bash
npm install
npm run dev
```

The app runs at http://localhost:3000. By default it proxies to the API at
`http://localhost:5208`. To point elsewhere, set `NEXT_PUBLIC_API_URL` in `.env.local`.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) runs all three on every push and pull request.

## Deployment

Pushing to `main` deploys to Azure App Service via
`.github/workflows/main_shining-stars-crm-app.yml`.

- `NEXT_PUBLIC_API_URL` is read at **build time** from the workflow's build step. Changing
  the Azure app setting alone does nothing.
- If the change depends on new API endpoints or a migration, deploy the backend first.
- Leave about 20 minutes between pushes. A deploy that starts while the previous one is still
  applying fails with a 409.
