# Project guidance

## Project overview

- Aparts CRM is a mobile-first Russian-language CRM for apartment hotels in Bansko.
- Frontend: Nuxt 4, Vue 3, TypeScript, Nuxt UI and Feature-Sliced Design under `src/`.
- Backend: Nitro API routes, PostgreSQL through Drizzle ORM, Zod contracts in `shared/contracts`.
- Money is stored in EUR with two decimal places. Operational planning uses calendar dates, not times.
- Database changes require a numbered SQL migration and a matching entry in `server/infrastructure/database/migrations/meta/_journal.json`.

## Main domains

- `/calendar` manages stays, guest services and apartment availability.
- `/work` is the main cleaning dispatcher; it contains the `Уборки` and `Задачи` tabs, daily/employee routes and route positions.
- `/inventory` manages consumable catalogues, apartment stock, replenishment and administrator discrepancy review.
- `/reports` and `/statement` show operational and financial summaries.
- `/settings` manages users, apartment types, cleaning tariffs, checklist templates and services.

## Cleaning rules

- Creating a stay does not automatically create a cleaning. An administrator creates a planned or stay-linked cleaning manually.
- A stay can have at most one linked cleaning; deleting that cleaning keeps the stay and makes assignment available again.
- Only administrators can create, edit, assign, reorder and delete cleanings. Owners (`manager`) and cleaners retain only their permitted operational actions.
- A cleaning may have multiple cleaners. New assignments go to the end of each cleaner's route; existing route positions are preserved when possible.
- A cleaner may start, complete and report problems for assigned work. Completed or canceled work cannot be edited by cleaners.
- Cleaning completion may include an optional inventory report: explicit usage becomes an owner-visible expense using FIFO cost, while the actual remaining quantity becomes the apartment stock. Discrepancies are logged without charging them twice.
- Cleaning deletion is transactional: linked assignments, attachments, financial rows and inventory movements are removed, and used stock is restored.

## Roles and data isolation

- `administrator` has organization-wide access and full manual cleaning CRUD.
- `manager` is the owner role and is limited to owned apartments and their financial/work data.
- `cleaner` sees assigned work and can operate only on assigned cleanings/tasks.
- Every server query and mutation must scope data by `actor.organizationId`; use `requireActor`, `requireRole` and `canManageApartment` instead of client-only checks.

## Frontend conventions

- Keep route composition in `src/pages`; extract a feature only when the interaction is genuinely reused in multiple places.
- Export feature/entity APIs through their `index.ts`; do not bypass slice public APIs.
- Reuse Nuxt UI controls and keep interactive hit areas at least 44px on mobile.
- In lists and grouped content, use subtle low-contrast separators; dividers should support grouping without competing with the content.
- Use `UTextarea` at full form width; when a form has multiple columns, make its `UFormField` span all columns and give the control `w-full`.
- For a date range, use one `DateRangeInput` rather than separate «с» and «по» controls; keep the start and end values separate in the submitted API contract when needed.
- Use the existing slideover forms and ellipsis action menus for work operations. Dangerous deletion requires the shared confirmation modal.
- Do not reintroduce hover-triggered popovers for calendar work details; opening is click-based.
- Use the hotel card composition as the shared visual rule for CRM catalog cards: `surface` card with `overflow: hidden`, a padded header containing a 44px icon and title/status content, and a separated footer for primary data and actions. Use a responsive `grid gap-4 md:grid-cols-2`, preserve 44px action hit areas, and keep card-specific classes for domain details.

## Protected data loading

Protected API lists that depend on the authenticated user (for example cleanings, apartments, stays, tasks, and assignable team members) must not rely on SSR data fetched before the client session is restored. Load these lists on the client with `useAsyncData({ server: false })`, provide an empty default value, and watch the current-user/session ref so the request runs again after authentication becomes available. This prevents lists from appearing empty after a full page reload while working after internal navigation.

## Verification

- Normal checks: `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- `npm run lint:fsd` checks FSD boundaries; if it fails with `EMFILE: too many open files, watch`, report it as an environment limitation rather than changing code to bypass it.
- Do not run browser/E2E checks unless the user explicitly requests them.
- Preserve unrelated uncommitted changes in the worktree.
