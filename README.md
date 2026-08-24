# Aparts CRM

Mobile-first CRM для управления апартаментами в Банско. Интерфейс на русском, денежные суммы вводятся и хранятся в EUR с точностью до двух знаков, а операционное планирование ведётся по датам без времени.

## Запуск

1. Скопируйте `.env.example` в `.env` и задайте `DATABASE_URL` (по умолчанию локальный порт `55432`), `NUXT_SESSION_PASSWORD`, `BOOTSTRAP_ADMIN_EMAIL` и `BOOTSTRAP_ADMIN_PASSWORD`.
2. Запустите инфраструктуру: `docker compose up -d`.
3. Выполните `npm install`, `npm run db:migrate`, затем `npm run dev`.

Первый администратор создается идемпотентно при старте сервера из переменных окружения.

## Production

Production работает в Docker Compose за host Nginx на отдельном VPS по адресу
`https://crm.aparts-bansko.com`. Образ приложения собирается на Node 22,
PostgreSQL и фотографии хранятся в отдельных Docker volumes, а миграции
выполняются одноразовым контейнером перед запуском новой версии.

Подготовка VPS, DNS, TLS, `.env.production`, внешний SMTP и ручной сценарий
обновления описаны в [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). GitHub Actions и
автоматические резервные копии в текущую схему не входят.

## Проверки

`npm run typecheck` — TypeScript и Vue.

`npm test` — правила Zod-контрактов.

`npm run test:e2e` — Playwright-сценарии входа на mobile и desktop. Перед запуском поднимите PostgreSQL, примените миграции и запустите приложение; при другом адресе задайте `E2E_BASE_URL`.

`npm run build` — production build и PWA service worker.

`npm run lint:fsd` — Steiger для границ Feature-Sliced Design.

## Структура

- `app/pages` — тонкие Nuxt route entrypoints;
- `src` — FSD-слои (`app`, `pages`, `features`, `entities`, `shared`);
- `server/modules` — доменные use cases и правила доступа;
- `server/infrastructure` — PostgreSQL/Drizzle, audit, notifications, seed;
- `shared/contracts` — общие Zod-контракты.

Ролевые инструкции для ежедневной работы: [docs/OPERATIONS.md](docs/OPERATIONS.md).
