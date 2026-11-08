# Production deployment

Aparts CRM разворачивается по SSH на отдельном VPS и доступна по адресу
`https://crm.aparts-bansko.com`. PostgreSQL и Nuxt/Nitro работают в Docker.
Приложение публикуется только на loopback-адресе `127.0.0.1:3000`, поэтому
напрямую из интернета доступны только host Nginx на портах 80/443 и SSH.

## DNS и подготовка VPS

Создайте A-запись `crm.aparts-bansko.com` на публичный IPv4 нового VPS.
Добавляйте AAAA только если на VPS настроен IPv6. Дождитесь распространения DNS:

```sh
dig +short A crm.aparts-bansko.com
dig +short AAAA crm.aparts-bansko.com
```

На Ubuntu/Debian установите Docker Engine с Compose plugin по официальной
инструкции Docker, затем host Nginx и Certbot:

```sh
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
docker --version
docker compose version
```

Если используется UFW, сначала сохраните SSH-доступ и только затем включайте
firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Не открывайте наружу порты 3000 и 5432.

## Checkout и production-секреты

Production checkout находится в `/home/aparts-bansko`:

```sh
sudo git clone https://github.com/LokkiDog/apartapp.git /home/aparts-bansko
sudo chown -R "$USER":"$USER" /home/aparts-bansko
cd /home/aparts-bansko
cp .env.production.example .env.production
chmod 600 .env.production
```

Если `.env.production` уже существует, не перезаписывайте его example-файлом.
Файл игнорируется Git и не должен попадать в коммиты или сообщения.

Обязательные значения:

- `POSTGRES_PASSWORD` и тот же URL-encoded пароль в `DATABASE_URL`;
- `NUXT_SESSION_PASSWORD` длиной не менее 32 символов;
- email и надежный пароль первого администратора;
- API-ключ Brevo или учетные данные внешнего SMTP;
- публичный и приватный VAPID-ключи;
- `NUXT_PUBLIC_APP_URL=https://crm.aparts-bansko.com`.

В `.env.production` должны быть заданы `NUXT_VAPID_SUBJECT`,
`NUXT_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY` и
`NUXT_PUBLIC_VAPID_PUBLIC_KEY`. Обе переменные публичного ключа содержат одно
и то же значение. Если хотя бы одно значение отсутствует, production-контейнер
не запускается, чтобы кнопка Push не отображалась как рабочая при пустой
конфигурации.

Для пароля PostgreSQL удобно использовать URL-safe hex, чтобы не кодировать
спецсимволы отдельно:

```sh
openssl rand -hex 32
openssl rand -base64 48
docker run --rm node:22-alpine sh -c "npx --yes web-push generate-vapid-keys"
```

Первое значение используйте одновременно в `POSTGRES_PASSWORD` и
`DATABASE_URL`, второе — как `NUXT_SESSION_PASSWORD`. Для Brevo задайте
`NUXT_BREVO_API_KEY` и подтвержденного отправителя в `NUXT_SMTP_FROM`.
При наличии API-ключа письма отправляются через HTTPS; SMTP остается резервным
режимом. Для STARTTLS задайте `NUXT_SMTP_PORT=587`,
`NUXT_SMTP_SECURE=false`; для SMTPS — `NUXT_SMTP_PORT=465`,
`NUXT_SMTP_SECURE=true`. `NUXT_SMTP_USER` и `NUXT_SMTP_PASSWORD` задаются
вместе.

Первый администратор создается идемпотентно при первом успешном старте.
Последующее изменение bootstrap-пароля не меняет существующую учетную запись.

## Экземпляры и релизы

| Ветка CRM | GitHub Environment | Checkout на VPS | Compose project | Домен |
| --- | --- | --- | --- | --- |
| `aparts` | `production` | `/home/aparts-bansko` | `aparts` | `crm.aparts-bansko.com` |
| `magicmop` | `magicmop-production` | `/home/magicmop-crm` | `magicmop` | `app.magicmopcrm.com` |

Общие изменения делаются в `main`, затем переносятся в каждую ветку релиза.
Push в ветку релиза или ручной запуск на ней собирает и выкатывает SHA события.
Существующие тома `aparts_postgres_data` и `aparts_uploads_data` используются
повторно. MagicMop получает свои тома и сеть. Его PostgreSQL доступен только
внутри Docker, гостевой контейнер не запускается.

### Подготовка checkout и окружений

1. На VPS проверьте ресурсы, свободный `127.0.0.1:3002` и Docker Compose
   версии 2.24.4 или новее. Установите `curl`, `python3`, `flock` и `rclone`.
2. Сделайте отдельный checkout для MagicMop. Сохраните текущий checkout
   Aparts и его `.env.production`. Скопируйте `.env.production.example` в
   новый checkout как `.env.production` с правами 0600. Для MagicMop укажите
   `POSTGRES_DB=magicmop`, `POSTGRES_USER=magicmop`, новый пароль и соответствующий
   `DATABASE_URL=postgresql://magicmop:<пароль>@postgres:5432/magicmop`.
   Установите `NUXT_ORGANIZATION_NAME=MagicMop`, `NUXT_PUBLIC_APP_URL=https://app.magicmopcrm.com`,
   `NUXT_BOOTSTRAP_ADMIN_EMAIL`, `NUXT_BOOTSTRAP_ADMIN_PASSWORD`, отдельные
   session/VAPID-ключи и подтверждённого
   отправителя MagicMop. Если нужен системный доступ для создания клиентов,
   укажите тот же адрес администратора в `SUPERUSER_EMAIL`.
3. Для каждого экземпляра создайте `/var/lib/aparts-deploy/<экземпляр>`
   с правами 0711 и владельцем SSH-пользователя деплоя. Запишите физический
   абсолютный путь checkout одной строкой в файл `checkout` (режим 0600).
   Nginx должен иметь право проверить существование файла `maintenance`.
4. В обоих GitHub Environments задайте `DEPLOY_HOST`, `DEPLOY_USER`,
   `DEPLOY_SSH_PRIVATE_KEY` и `DEPLOY_KNOWN_HOSTS`. Для MagicMop используйте
   отдельный SSH-ключ. Закрепите проверенный host key сервера и разрешите
   каждому Environment только его ветку. При необходимости задайте variables
   `DEPLOY_PATH` и `DEPLOY_PORT`. Пользователю деплоя нужен доступ к своему
   checkout и Docker.
5. Установите HTTPS-vhost обоих экземпляров с проверкой файла `maintenance`
   до первого запуска Actions. Во время миграций Nginx возвращает 503.
   Деплой сам проверяет этот ответ перед остановкой CRM. Затем снимает дамп,
   применяет миграции, проверяет healthcheck и бренд PWA и сохраняет SHA
   в `/var/lib/aparts-deploy/<экземпляр>/release-sha`.

Скрипт хранит предыдущие образы под тегами `<экземпляр>-app:rollback`
и для Aparts `aparts-guest:rollback`, а дамп перед миграциями — в
`rollback/database.dump` в каталоге состояния. Если запуск после миграции
не прошёл, скрипт восстанавливает базу и предыдущий образ, пока вход закрыт
кодом 503. При прерванной операции или ошибке восстановления сохраните
`maintenance` и закончите восстановление вручную до снятия этого файла.

### Резервные копии

1. Настройте offsite-репозиторий rclone с шифрованием и сроком хранения
   не менее 30 дней. Для каждого экземпляра создайте `backup.env` (0600)
   с `CRM_BACKUP_REMOTE=remote:crm-backups` и абсолютным `RCLONE_CONFIG`.
   Скрипт добавляет отдельный префикс экземпляра и метку времени.
2. Установите unit-файлы из `deploy/systemd/`. В drop-in для каждого service
   задайте `[Service]` и `User=<SSH-пользователь деплоя>` с доступом к
   Docker, каталогу состояния и конфигу rclone. Выполните `systemctl daemon-reload`
   и включите таймеры `aparts-backup@aparts.timer` и
   `aparts-backup@magicmop.timer`.
3. Запустите по одному `aparts-backup@<экземпляр>.service` вручную. Таймер
   кратковременно останавливает целевую CRM за ответом 503, чтобы копии
   БД и загрузок соответствовали одному состоянию. Передача в offsite
   идёт после возобновления CRM. При сбое передачи локальная копия остаётся
   в `backups/`. Контролируйте статусы таймеров и свободное место на VPS.
4. До открытия MagicMop клиентам запустите `./deploy/verify-backup.sh <offsite-каталог>`
   от пользователя бэкапа с его `RCLONE_CONFIG`. Скрипт скачивает копию,
   проверяет контрольные суммы, восстанавливает БД во временный PostgreSQL
   и распаковывает файлы в изолированный каталог. Повторяйте проверку после
   изменения инфраструктуры и настроек копирования.

## Host Nginx и TLS

Отключите стандартную страницу Nginx и установите default virtual host,
который отклоняет обращения по IP и запросы с неизвестным `Host`:

```sh
sudo cp deploy/nginx/aparts-default.conf /etc/nginx/sites-available/aparts-default
sudo ln -sfn /etc/nginx/sites-available/aparts-default /etc/nginx/sites-enabled/aparts-default
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Ответ по HTTP-IP будет закрыт без тела, а TLS-handshake по HTTPS-IP будет
отклонен. Домены
`aparts-bansko.com` и `crm.aparts-bansko.com` продолжат обслуживаться своими
virtual host.

Сначала установите временный HTTP virtual host:

```sh
sudo cp deploy/nginx/aparts-http.conf /etc/nginx/sites-available/aparts-crm
sudo ln -s /etc/nginx/sites-available/aparts-crm /etc/nginx/sites-enabled/aparts-crm
sudo nginx -t
sudo systemctl reload nginx
```

Если symlink уже существует, повторно создавать его не нужно. После того как
`http://crm.aparts-bansko.com/api/health` отвечает, выпустите сертификат без
автоматического переписывания конфигурации:

```sh
sudo certbot certonly --nginx -d crm.aparts-bansko.com
```

Замените временный virtual host полной HTTPS-конфигурацией и перезагрузите
Nginx:

```sh
sudo cp deploy/nginx/aparts.conf /etc/nginx/sites-available/aparts-crm
sudo nginx -t
sudo systemctl reload nginx
```

Проверьте автоматическое продление сертификата:

```sh
sudo certbot renew --dry-run
systemctl status certbot.timer --no-pager
```

Полный Nginx-конфиг устанавливает HTTPS-редирект, стандартные proxy-заголовки
и лимит запроса 10 МБ для фотографий размером до 8 МБ.

### HTTPS для MagicMop CRM

Убедитесь, что `app.magicmopcrm.com` указывает на текущий VPS. Проверьте, что
этот домен встречается ровно в одной включённой конфигурации Nginx. Для
первого выпуска сертификата установите `deploy/nginx/magicmop-crm-http.conf`
как временный HTTP-vhost и выполните `sudo nginx -t && sudo systemctl reload nginx`.
Выпустите сертификат командой `sudo certbot certonly --nginx -d app.magicmopcrm.com`.
Замените временный конфиг на `deploy/nginx/magicmop-crm.conf`, снова проверьте
и перечитайте Nginx. При существующем сертификате можно сразу установить
HTTPS-vhost. Ссылка «Войти» на лендинге ведёт на
`https://app.magicmopcrm.com/login` после проверки коммерческой CRM.

## Гостевой сайт основного домена

`aparts-bansko.com` обслуживает отдельное Nuxt-приложение `guest/` на порту
`127.0.0.1:3001`. CRM остаётся на `crm.aparts-bansko.com:443` и локальном порту 3000.
Сервисы используют одну базу через публичный API CRM; у гостевого приложения нет
доступа к БД или закрытым API. Старый `deploy/site/` больше не используется.

Настройки контента хранятся в CRM, а не в окружении контейнеров:

1. В «Профиль» добавьте имя, телефон WhatsApp в международном формате, фото
   (JPG/PNG/WebP до 8 МБ) и описание на русском, английском, иврите и болгарском.
2. Администратор открывает «Настройки → Сайт», задаёт полный адрес без пути
   (`https://aparts-bansko.com`), выбирает контактный профиль и включает сайт.
   Публикуются только имя, телефон, фото и описание выбранного профиля.
3. Организация определяется по точному адресу сайта, закреплённому в настройках.
   Адрес уникален между организациями. Чужой профиль выбрать нельзя.

Миграция `0054_public_site_settings` добавляет настройки сайта и поля профиля.
При первом обновлении со старой версии **после миграции заполните профиль и
настройки сайта**: значения старых переменных окружения не импортируются.
До включения сайта публичный API не выдаёт каталог и контактные данные.
Прежние `NUXT_CATALOGUE_ORGANIZATION_ID`, `NUXT_PUBLIC_CATALOGUE_URL`,
`NUXT_PUBLIC_SITE_URL`, `NUXT_PUBLIC_WHATSAPP` и `NUXT_PUBLIC_HOST_*` больше
не используются; после настройки их можно удалить из `.env.production`.
Фото из профиля хранится в uploads volume и очищается от EXIF при загрузке.
Изменения профиля и настроек видны после обновления страницы сайта без сборки
и перезапуска контейнеров. Отключение сайта, блокировка организации или
архивация контактного профиля закрывают публичный API, включая фотографии.

Адрес должен совпадать с внешним origin (схема, домен и порт). Nginx передаёт
`Host` и `X-Forwarded-Proto`; гостевой сервис по-прежнему обращается к CRM
через `NUXT_CATALOGUE_API_BASE=http://app:3000` внутри Docker.
DNS, TLS, адрес API, SMTP, ключи Google/Push и пароли остаются инфраструктурой.
Изменение адреса в CRM не меняет DNS и конфигурацию Nginx.

На `/` расположены баннер, подборка первых трёх опубликованных апартаментов
и блок о хозяине из выбранного профиля. Полный каталог с картой доступен
на `/apartments`; отдельные апартаменты — на `/apartments/:slug`.

Миграция `0051_apartment_publications` создаёт отдельные публикации; миграция
`0053_publication_all_apartment_photos` переводит галерею на все фотографии квартиры.
Существующие объекты не публикуются автоматически. Администратор нажимает
«Настроить публикацию» рядом с «Отмена» и «Сохранить», заполняет публичные поля
в попапе, включает «Показывать на сайте» и сохраняет публикацию отдельно.
Кнопка «Посмотреть переводы» в попапе публикации открывает английский, иврит и
болгарский тексты: при первом открытии выполняется автоматический перевод,
затем доступны ручная правка и «Перевести заново». Переводы применяются к черновику
и сохраняются вместе с публикацией. Изменение исходного текста сбрасывает переводы.
Используются ключ Google и общий месячный лимит из настройки перевода допуслуг;
в Google отправляются только четыре публичных поля, без карточки квартиры и гостей.
API каталога принимает `?locale=en`, `?locale=he` или `?locale=bg`; незаполненные
переводные поля возвращаются на русском. Гостевой сайт переключает русский, английский, иврит и болгарский в шапке.
Выбор записывается в функциональную cookie `aparts-guest-locale`; параметр `?lang=`
в ссылке имеет приоритет. Язык сохраняется в ссылках на апартаменты, контакты,
политику и в сообщениях WhatsApp. Без перевода поля используются русские тексты.
Для иврита включается RTL; язык также отражается в canonical, hreflang и sitemap.
Описания хозяина на всех четырёх языках редактируются в его профиле CRM;
при отсутствии перевода используется русский текст.
На сайте показываются все фото в порядке галереи квартиры, главное фото — обложка.
Добавление, перестановка и удаление фото сразу отражаются на сайте.
Архивные/неактивные апартаменты не выдаются, удаление последнего фото снимает
публикацию. Скрытая страница и её фотографии возвращают 404.

Порядок первого запуска:

1. После установки HTTPS-vhost CRM запустите workflow для ветки `aparts`.
2. Проверьте локальные порты 3000 и 3001 и подготовьте публикации в CRM.
3. Установите `deploy/nginx/aparts-site-http.conf`, выпустите отдельный сертификат
   `certbot certonly --nginx -d aparts-bansko.com`, затем установите
   `deploy/nginx/aparts-site.conf` в `/etc/nginx/sites-available/aparts-site`.
4. Выполните `sudo nginx -t`, затем `sudo systemctl reload nginx`.
   Конфигурацию CRM при этом менять не нужно.

Для существующего сертификата достаточно заменить конфигурацию основного домена,
проверить Nginx и выполнить reload. Для отката главного сайта верните прежний static
virtual host; таблицы публикаций совместимы с остальной CRM.

Локально запускайте два разных приложения из корня репозитория:

```sh
npm run dev -- --port 3000
npm run dev:guest
```

Для локального сайта укажите `http://localhost:3001` в «Настройки → Сайт»
локальной CRM. В `guest/.env` при необходимости задайте только
`NUXT_CATALOGUE_API_BASE=http://localhost:3000`. Это не изменяет production-БД.

Вторая команда запускает именно `guest/`; повторный `npm run dev` поднимает ещё
одну CRM и не заменяет гостевой сайт. Используйте Node.js 22.18+.

Сайт публикует `/sitemap.xml` со страницами опубликованных объектов и `/robots.txt`.
Локальные preview-домены закрыты от индексации. Ответы каталога и фото не
кэшируются публично: снятие публикации отзывает доступ и к файлам.

 Гостевой сервер обращается к CRM
по `NUXT_CATALOGUE_API_BASE` (по умолчанию `http://127.0.0.1:3000`). В Docker это
`http://app:3000`. Запросы гостей не передают cookies в CRM.

## Финальная проверка

```sh
curl --fail --show-error https://crm.aparts-bansko.com/api/health
curl --fail --show-error --head https://crm.aparts-bansko.com/manifest.webmanifest
```

Healthcheck возвращает только `{ "status": "ok" }` после успешного запроса к
PostgreSQL. Затем проверьте вход bootstrap-администратором и отправьте
приглашение на контролируемый email для проверки SMTP.

Для MagicMop выполните те же проверки на `https://app.magicmopcrm.com`.
Перед первым запуском клиентских аккаунтов проверьте восстановление offsite-копии.

## Перевод названий допуслуг

Используется Google Cloud Translation Basic v2, модель NMT. В проекте Google Cloud
подключите биллинг и включите Cloud Translation API. Создайте серверный API key,
ограничьте его Cloud Translation API и, при фиксированном исходящем IP сервера,
этим IP. Настройте квоты API под ожидаемый объём.

Добавьте в `.env.production` (для локальной разработки — `.env`):

```dotenv
NUXT_GOOGLE_TRANSLATION_API_KEY=your-server-api-key
```

Ключ читается из private runtimeConfig, передаётся Google в заголовке
`x-goog-api-key` и не выдаётся браузеру. После изменения окружения пересоздайте
контейнер приложения. Потребуется миграция `0045_service_name_translations`.
Инструкции API: https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate
и https://docs.cloud.google.com/docs/authentication/api-keys-use.

Администратор открывает «Посмотреть переводы» в форме услуги. Если переводов
ещё нет, отправляется только название (до 120 символов) на три языка: ru/en/he,
с автоматическим определением исходного языка. Ответы можно изменить вручную.
«Применить» меняет только черновик формы; запись в БД происходит при сохранении
услуги. «Отмена» в окне не применяет изменения. Повторное открытие использует
применённые переводы; повторный запрос выполняется кнопкой «Перевести заново».
При изменении оригинала переводы очищаются. Если ключ отсутствует или Google
недоступен, окно позволяет вводить переводы вручную, а услуга сохраняется без них.
Пустой перевод отображается как оригинальное название.

Переводы копируются в услуги брони при назначении; старые брони сохраняют прежние
названия. Миграция не переводит существующие записи автоматически: откройте
нужную услугу, получите переводы и сохраните её. Уже назначенные услуги сохраняют
исходные снимки. На один процесс установлен лимит 10 запросов в минуту на
администратора организации; для нескольких реплик общий лимит задаётся квотами
Google или на шлюзе. Запросы к Google имеют таймаут 10 секунд без автоповторов.

### Месячный лимит автоперевода

Миграция `0046_translation_monthly_usage` добавляет общий счётчик символов в БД
для всех организаций и реплик Aparts. По умолчанию лимит — 450 000 символов,
ниже бесплатного объёма NMT 500 000. Его можно уменьшить через окружение:

```dotenv
NUXT_GOOGLE_TRANSLATION_MONTHLY_CHARACTER_LIMIT=450000
```

`0` отключает автоперевод. Допустимы только целые значения от 0 до 450000;
некорректное значение блокирует автоперевод. После изменения окружения
пересоздайте контейнер приложения. Обычный перезапуск не обнуляет счётчик.

Перед отправкой резервируется количество Unicode code points в названии,
умноженное на три целевых языка. Атомарный запрос PostgreSQL не позволяет
параллельным запросам превысить лимит. При недостаточном остатке запрос
целиком отклоняется до обращения к Google; ручное редактирование доступно.
Ошибки Google, частичные результаты и закрытие окна не возвращают резерв:
запрос мог быть тарифицирован. Автоматических повторов нет.

Новый месяц определяется по времени PostgreSQL в `America/Los_Angeles`,
согласно календарным месяцам биллинга Google. Для нового месяца создаётся
отдельная строка; старые строки сохраняются. Счётчик не содержит названий,
ключей или данных организаций и не выдаётся клиентам через API.

Защита учитывает только запросы этой установки Aparts начиная с применения
миграции. Расходы других приложений, отдельных БД Aparts, других проектов
платёжного аккаунта и обращения до установки счётчика ей неизвестны. Если
такие расходы уже были, уменьшите лимит на оставшийся месяц или задайте 0.
Не обнуляйте таблицу и не восстанавливайте старый счётчик в текущем месяце.
Сохраняйте также квоты на стороне Google. Источник расчёта месяцев:
https://docs.cloud.google.com/billing/docs/how-to/pricing-table.

## MagicMop landing reCAPTCHA

Only the MagicMop instance exposes `POST /api/public/booking/verify` and its
OPTIONS preflight. This token-only API does not use CRM sessions or the database.
Aparts returns 404. Existing authenticated API CORS restrictions stay in place.

Set `NUXT_RECAPTCHA_SECRET_KEY` in `/home/magicmop-crm/.env.production`.
Do not replace the rest of the CRM environment. The old standalone service and
`/var/www/magicmop-landing/.env` are no longer used by the application.
The server also accepts `RECAPTCHA_SECRET_KEY` for migration, but prefer the
Nuxt-prefixed variable. The secret must never appear in public runtime config.

Allowed browser origins default to `https://magicmopcrm.com` and
`https://www.magicmopcrm.com`. Customize with comma-separated
`NUXT_RECAPTCHA_ALLOWED_ORIGINS`; use `NUXT_RECAPTCHA_MINIMUM_SCORE` to change
the default 0.5 threshold. Token action must be `demo_booking`; Google hostname
must match the browser origin, and tokens older than two minutes are rejected.
The endpoint allows ten attempts per minute per IP per process. Production
Nginx must overwrite X-Real-IP, and the container must remain loopback-only.

Deploy the new backend before enabling the landing public site key. Recreate
the existing app container after editing environment variables; a container
restart alone does not refresh its environment. Docker Compose already loads
`.env.production`; no new service, port, database or Nginx route is required.
Set repository variable `RECAPTCHA_SITE_KEY` in the landing repository and
rebuild that static site. Its default verification URL is
`https://app.magicmopcrm.com/api/public/booking/verify`.

### Add booked MagicMop demo to a calendar

Set `NUXT_CALENDLY_API_TOKEN` in the same MagicMop `.env.production`. The PAT
needs only `scheduled_events:read`; no public variable or separate service is
needed. `NUXT_CALENDLY_EVENT_NAME` defaults to `Демо MagicMop` and must match
the booked Calendly event title. Recreate the app container on the next deploy
to load changes to its environment.

`POST /api/public/booking/calendar` takes only the event UUID and invitee UUID
from the trusted Calendly booking-completed message. Both are required; the
backend confirms their relationship and active status before returning only
the event title, times, invitee timezone, safe HTTPS Zoom join URL and stable
iCalendar UID. Internal notes, invitee PII and management links are not exposed.
The references act as an unguessable capability pair; keep them out of URL query
strings and application logs. The existing landing origin allowlist and
per-IP booking limit apply. Provider requests do not follow redirects.

The landing generates a Google Calendar draft and a UTF-8 iCalendar file in
the browser. Both contain the actual scheduled times and Zoom link. These are
calendar copies; later reschedules/cancellations remain managed by the original
Calendly invitation. If Zoom is still provisioning, the UI waits for a manual
refresh before offering exports. No extra meeting is created.
