---
name: aparts-design
description: Build, change, or review Aparts CRM interfaces using its shared theme and components. Read for pages, components, forms, cards, navigation, CSS, Nuxt UI theme or motion; not for backend-only tasks.
---

# Aparts interface design

Use the existing mobile-first Aparts theme. Preserve role-specific actions and unrelated working-tree changes.

## Sources of truth

Paths below are relative to the repository root:

- `src/app/styles/main.css`: palette, semantic status tones, typography, surfaces, catalogue geometry, states, responsive layouts and reduced motion.
- `app/app.config.ts`: Nuxt UI slot defaults. Check installed Nuxt UI source for generated tokens and slot names when needed.
- `src/shared/ui/index.ts`: public API for shared controls, headers, empty states, badges and confirmations.

Search for an existing component or pattern before adding one. Use slice public APIs. Extract shared behaviour only when genuinely reused; keep route composition in pages. Avoid copying identical domain styles.

## Theme and surfaces

- Use `--color-canvas`, `--color-surface`, `--color-surface-muted`, `--color-ink`, `--color-muted`, `--color-primary`, `--color-primary-strong`, `--color-primary-soft` and `--color-line` rather than approximate local colours.
- Nuxt UI semantic variables map to the Aparts tokens. Keep custom UI and Nuxt UI colours consistent; do not introduce an independent palette. Use `--tone-*-bg` / `--tone-*-ink` pairs for semantic statuses. Nuxt UI generates `--color-success` and shade variables; inspect definitions before treating them as missing.
- Use Onest; Hebrew uses Noto Sans Hebrew. Use `PageHeader` for regular page headings and `tabular-nums` for sums/counts. Keep labels short and follow the page's existing localisation.
- Use `surface` (16px radius, `--shadow-surface`) for primary panels. Controls normally use 10px radii; overlays use existing 14–16px radii and `--shadow-overlay`. Match spacing to existing shared components.
- Separate groups with `--color-line`; avoid heavy borders and repeated nested card frames.

## Cards and domain variants

- Catalogue cards follow the hotel: `surface`, overflow hidden, padded header with 44px icon/title/optional status, separated footer for primary data and actions. Use `grid gap-4 md:grid-cols-2`.
- Reuse `catalog-card` and its `__header`, `__icon`, `__content`, `__body`, `__footer` classes. Hotel/service footer layouts may stay specialised.
- Preserve photo cards, apartment density modes, calendar grids, report rows, worker routes and the warmer auth layout as domain variants. Unify tokens and controls without forcing them into catalogue cards.
- Use `StatusBadge` for entity statuses; `UBadge` for roles, categories and counters. Preserve existing compact mobile status presentations.

## Forms and actions

- Reuse Nuxt UI controls, slideover forms and ellipsis menus. Use `form-actions form-actions--footer`: cancellation first, submission second.
- Use full-width `UTextarea`; its field must span all columns in multi-column forms. Use one `DateRangeInput`, keeping separate start/end values in the API.
- Use `DeleteConfirmModal` for ordinary dangerous deletion and `ConfirmActionModal` for other confirmations. Show loading/errors, prevent duplicate submissions and keep failed requests retryable. Never use browser `confirm()`.
- Preserve specialised typed-name or related-record decision dialogs. Capture target IDs when opening destructive confirmations; cancel issues no mutation.
- Calendar details open by click; do not add hover-triggered detail popovers.

## Interaction and accessibility

- Actionable elements need appropriate cursor, subtle hover/pressed feedback and visible keyboard focus. Disabled/read-only elements must not suggest available actions.
- Prefer native buttons/links. Existing actionable cards need role, accessible name, tabindex and Enter/Space handling. Guard parent keyboard handlers with `.self` to preserve nested links/menus; stop nested clicks where necessary.
- Inventory rows animate only `background-color` with a short explicit transition. Gate feedback on interactivity and preserve warning/status colours in all states.
- New mobile controls use at least 44px hit areas. Do not automatically enlarge existing compact 24px/36px controls or calendar days during visual refactors. Explicit user instructions take precedence.
- Name transition properties; respect existing reduced-motion, touch scrolling and mobile safe-area rules.

## Verification

Follow `AGENTS.md`: tests, typecheck, build, FSD lint and diff checks. Report FSD `EMFILE` as an environment limitation. Browser/E2E checks require an explicit request. Check role visibility, nested actions, cancellation/confirmation, loading/errors and keyboard behaviour in affected code. Add meaningful behavioural tests only where warranted; avoid wording-matching tests.
