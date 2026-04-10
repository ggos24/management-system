# CLAUDE.md — Management System

## Project Overview

Notion-style team management & content pipeline tool for media companies. React 19 SPA backed by Supabase (Postgres + Auth + Edge Functions + Storage + Realtime). Features Kanban boards, table views, calendar scheduling, analytics dashboards, in-app + Telegram notifications, docs/knowledge base, and role-based access (admin/editor/user).

## Tech Stack

| Layer     | Tech                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| Framework | React 19, TypeScript 5.8, Vite 6                                                |
| Routing   | React Router 7 (`createBrowserRouter`, path-based routes)                       |
| Styling   | Tailwind CSS v4 (new `@theme`/`@variant`/`@utility` API), class-based dark mode |
| State     | Zustand 5 (3 stores: `authStore`, `dataStore`, `uiStore`)                       |
| Backend   | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)                    |
| Rich Text | Tiptap (ProseMirror-based, used in docs editor)                                 |
| Charts    | Recharts                                                                        |
| Icons     | lucide-react                                                                    |
| Toasts    | sonner                                                                          |
| Testing   | Vitest 4, Testing Library, jsdom                                                |
| Linting   | ESLint 9 (flat config) + Prettier (120 cols, single quotes, trailing commas)    |
| CI        | GitHub Actions (lint → test → build), Husky + lint-staged pre-commit            |

## Quick Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run test:run     # Run tests once
npm run lint         # Lint .ts/.tsx files
npm run format       # Format all files with Prettier
```

## Project Structure

**Source files live at root — no `src/` directory.**

```
/                        Root = source root
├── App.tsx              Thin wrapper: renders RouterProvider
├── routes.tsx           All route definitions (createBrowserRouter)
├── index.tsx            Entry point (ReactDOM.createRoot)
├── app.css              Global styles (Tailwind v4 config, custom theme)
├── types.ts             All TypeScript interfaces/types (single file)
├── constants.ts         Status/priority colors, helper functions
├── layouts/
│   └── AppLayout.tsx    Main authenticated layout (sidebar, header, modals, Outlet)
├── components/          React components (flat structure, ~34 files)
│   ├── ui/              Shared primitives (Button, Input, Label, Badge, Card, FormField, Divider)
│   │   └── index.ts     Barrel export
│   ├── Workspace.tsx    Kanban board + table + calendar (~2800 lines, largest)
│   ├── Dashboard.tsx    Analytics with Recharts
│   ├── Schedule.tsx     Team availability & shift calendar
│   ├── DocsView.tsx     Docs/knowledge-base browser
│   ├── DocsEditor.tsx   Tiptap rich text editor for docs
│   ├── Bin.tsx          Deleted tasks view
│   ├── LoginPage.tsx    Auth: login, set-password, reset-password
│   ├── AuthGuard.tsx    Route protection (redirects unauthenticated)
│   ├── ErrorBoundary.tsx  React error boundary wrapper
│   ├── Header.tsx       Top bar: search, theme toggle, notifications
│   ├── Sidebar.tsx      Navigation with drag-reorder teams
│   ├── Modal.tsx        Reusable modal shell
│   ├── TaskModal.tsx    Task create/edit (lazy-loaded)
│   ├── SettingsModal.tsx  Profile, Telegram, members, logs (lazy-loaded)
│   ├── ManageTeamsModal.tsx  Team CRUD (lazy-loaded)
│   ├── InviteModal.tsx  Invite users via edge function (lazy-loaded)
│   └── ...              Other: Avatar, CustomSelect, MultiSelect, TagSelect, SimpleDatePicker, etc.
├── stores/              Zustand stores
│   ├── authStore.ts     Session, current user, auth state
│   ├── dataStore.ts     All domain data + CRUD actions (~1200 lines)
│   └── uiStore.ts       UI state, modals, dark mode, notifications
├── hooks/               Custom hooks
│   ├── useAuth.ts       Auth initialization
│   ├── useRealtimeSync.ts  Supabase Realtime subscriptions
│   ├── useTaskDeepLink.ts  React Router task deep link handler
│   └── useHashRedirect.ts  Legacy hash URL → path redirect
├── lib/
│   ├── supabase.ts      Supabase client (single instance)
│   ├── database.ts      All DB queries (~1150 lines, mapper functions)
│   ├── cn.ts            clsx + tailwind-merge utility
│   ├── utils.ts         Absence stats, team slug helpers
│   └── fetchWithRetry.ts  Retry wrapper (available, not currently used)
├── supabase/
│   ├── functions/       Edge functions (Deno): invite-user, send-telegram, telegram-webhook
│   └── migrations/      27 SQL migrations
└── test/
    ├── setup.ts         Testing Library/jest-dom setup
    └── smoke.test.tsx   Basic import verification tests
```

## Architecture Patterns

### Routing

React Router 7 with `createBrowserRouter` in `routes.tsx`. Path-based URLs:

- `/dashboard`, `/workspace`, `/schedule`, `/bin`
- `/teams/:teamId` (slug or UUID)
- `/docs/help`, `/docs/kb`
- Deep links: `/teams/<slug>?task=<taskId>`

Route-level code splitting via `React.lazy()` for Dashboard, Workspace, Schedule, Bin, DocsView. Modals (TaskModal, SettingsModal, ManageTeamsModal, InviteModal) are also lazy-loaded in `AppLayout.tsx`.

Legacy `#hash` URLs are auto-redirected by `useHashRedirect` hook.

### Data Flow

```
Component → Store action (optimistic update) → lib/database.ts → Supabase
                                                                    ↓
Component ← Store state ← Realtime subscription (full refetch) ← Supabase
```

### Store Conventions

- **authStore**: Session & user profile. `loadProfile()` is a standalone async export.
- **dataStore**: All domain data. Actions do optimistic updates, then call DB. On error: rollback or toast. Cross-store access via `useAuthStore.getState()`.
- **uiStore**: UI-only state. All modal open/close booleans, dark mode, search, notifications.

### Database Layer (`lib/database.ts`)

- **All Supabase queries centralized** — components never import `supabase` directly (except auth calls in LoginPage).
- **Mapper functions** (`mapProfile`, `mapTeam`, `mapTask`, etc.) convert snake_case DB rows → camelCase TS objects.
- **Naming**: `fetch*` (reads), `upsert*` (create/update), `sync*` (junction table delete+reinsert), `delete*`, `update*`.

### Notifications

Fire-and-forget pattern. `notify()` inserts DB notification AND sends Telegram via edge function. `notifyMany()` for batch notifications. Self-notifications are filtered out. Non-blocking `.catch(console.error)`.

### Permissions

Three roles: `admin`, `editor`, `user`. Helper functions in `constants.ts`:

- `isAdmin(role)` — admin only
- `isEditorOrAbove(role)` — admin or editor

Schedule management (shifts, absences for others) is admin-only. Non-admins can only submit absence requests for themselves.

## Naming Conventions

| What          | Convention                                                       | Example                                             |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Components    | PascalCase files, named exports, `React.FC<Props>`               | `TaskModal.tsx`, `export const TaskModal: React.FC` |
| UI primitives | `React.forwardRef`, accept `className`, use `cn()`               | `components/ui/Button.tsx`                          |
| Stores        | `use{Name}Store`, `create<StateType>()`                          | `useDataStore`                                      |
| Hooks         | `use{Name}`                                                      | `useRealtimeSync`                                   |
| DB functions  | `fetch*/upsert*/sync*/delete*/update*`                           | `fetchTasks`, `upsertTask`                          |
| Types         | PascalCase interfaces, camelCase props                           | `interface Task { teamId: string }`                 |
| DB columns    | snake_case (mapped in database.ts)                               | `team_id` → `teamId`                                |
| CSS           | Tailwind utility-first, zinc neutrals, dark: variants everywhere | —                                                   |

## Styling Rules

- **Tailwind CSS v4** — uses `@import 'tailwindcss'`, `@theme {}`, `@variant dark` in `app.css`
- **Dark mode**: Class-based (`.dark` on `<html>`), toggled in uiStore. Always include `dark:` variants.
- **Color palette**: Zinc for neutrals. Brand accents via constants.ts status/priority maps.
- **UI primitives** in `components/ui/`: Use these instead of duplicating inline classes.
  - `<Button variant="primary|ghost|danger|link" size="sm|md">`
  - `<IconButton>` for icon-only buttons
  - `<Input>` for text inputs
  - `<Label variant="form|section">` for labels
  - `<Badge color="zinc|emerald|red|blue|amber|purple">` for status badges
  - `<Card padding="none|sm|md|lg" hoverable>` for card surfaces
  - `<FormField label="..." required>` for label+input wrappers
  - `<Divider orientation="horizontal|vertical">` for separators
- **AlertBanner pattern** (variant map + props): Follow this for any new component with variants.
- **Font**: Inter (Google Fonts)

## Environment Variables

```
VITE_SUPABASE_URL=        # Supabase project URL
VITE_SUPABASE_ANON_KEY=   # Supabase anon key
```

Typed in `vite-env.d.ts`. Example in `.env.example`.

## Supabase Backend

### Key Tables

`profiles`, `teams`, `tasks`, `task_assignees`, `task_team_links`, `placements`, `task_placements`, `team_statuses`, `team_content_types`, `custom_properties`, `absences`, `shifts`, `permissions`, `activity_log`, `notifications`, `telegram_links`, `task_comments`, `docs`, `user_team_orders`

### RLS Policy Model

- SELECT: all authenticated users
- Mutations: team-scoped for regular users, unrestricted for admins
- Admin check: `is_admin()` helper function
- Profile updates: users own profile, admins any
- Per-user data (e.g. `user_team_orders`): `user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())`

### Edge Functions (Deno)

- `invite-user` — Admin-only user invitation
- `send-telegram` — Send Telegram notifications to linked users
- `telegram-webhook` — Public webhook for `/start CODE` linking flow

### Realtime

Subscribed tables: `tasks`, `profiles`, `absences`, `shifts`, `notifications`. Strategy: full refetch on any change event.

## Code Style

- **Prettier**: 120 char width, single quotes, semicolons, trailing commas (all), 2-space indent
- **ESLint**: `@typescript-eslint/no-explicit-any` = warn, `@typescript-eslint/no-unused-vars` = warn (prefix `_` to suppress)
- **ESLint strict React rules** (errors, not warnings):
  - `react-hooks/set-state-in-effect` — Do NOT call `setState` directly in a `useEffect` body. Move state resets into event handlers instead of reacting to state changes in effects.
  - `react-hooks/refs` — Do NOT pass functions that read `.current` from refs to render-prop callbacks (e.g. `renderTrigger`). The linter traces ref access through closures. Use `useLayoutEffect` for synchronous ref reads after state changes instead.
- **Imports**: No path aliases used in practice (despite `@/*` config). Use relative paths.
- **Exports**: Named exports for components. `export default` only on page-level components (Dashboard, Workspace, Schedule, LoginPage).
- **No barrel exports** at component root — import directly from file, except `components/ui/index.ts`.

## Build & Code Splitting

Vite builds with manual chunk splitting configured in `vite.config.ts`:

- `vendor-recharts` — Recharts library
- `vendor-supabase` — Supabase client
- `vendor-tiptap` — Tiptap editor extensions

Route components and modals are lazy-loaded via `React.lazy()` to keep all chunks under 500KB.

## Testing

Minimal test coverage. Vitest with jsdom and Testing Library. Run with `npm run test:run`. Current tests are smoke-level only (import verification in `test/smoke.test.tsx`).

## Working with This Codebase

### Adding a New Component

1. Create `components/YourComponent.tsx` with `React.FC<Props>` and named export
2. Use UI primitives from `components/ui/` instead of inline Tailwind for buttons, inputs, labels, badges, cards, dividers
3. Always include dark mode variants (`dark:bg-zinc-900`, `dark:text-white`, etc.)

### Adding a New Route/View

1. Create component in `components/` with `React.lazy()` wrapper in `routes.tsx`
2. Add route definition in `routes.tsx` under the `AppLayout` children
3. Add sidebar entry in `Sidebar.tsx`
4. Navigate via `useNavigate()` from React Router

### Adding a New Store Action

1. Add to `dataStore.ts` following optimistic update pattern
2. Call corresponding `lib/database.ts` function
3. Handle errors with toast or state rollback

### Adding a New DB Query

1. Add to `lib/database.ts` with a mapper function for snake_case → camelCase
2. Follow naming: `fetch*` / `upsert*` / `delete*` / `sync*`

### Adding a New Supabase Table

1. Create migration in `supabase/migrations/`
2. Add RLS policies (SELECT for authenticated, mutations based on role)
3. Use `(SELECT id FROM profiles WHERE auth_user_id = auth.uid())` for user-scoped RLS — NOT `auth.uid()` directly (profiles.id differs from auth.uid)
4. Add mapper and fetch/upsert functions to `lib/database.ts`
5. Add Realtime subscription in `hooks/useRealtimeSync.ts` if needed
