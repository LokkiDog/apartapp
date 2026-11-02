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

## Первый запуск

Проверьте production-конфигурацию:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

Для первого запуска выполните:

```sh
cd /home/aparts-bansko
./deploy/deploy.sh
```

Скрипт требует чистый checkout на ветке `main`, выполняет fast-forward из
`origin/main`, собирает app и migrate images, запускает PostgreSQL, применяет
Drizzle-миграции и ждет healthy-состояния приложения. Ошибка сборки не
останавливает текущую версию; ошибка миграции не запускает новую.

Проверьте локальный endpoint до настройки Nginx:

```sh
curl --fail --show-error http://127.0.0.1:3000/api/health
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 app
```

## Автоматический деплой из GitHub

Workflow `.github/workflows/deploy.yml` запускается после каждого push в
ветку `main`. Сначала GitHub Actions устанавливает зависимости, запускает
тесты, typecheck и production build. Только после успешных проверок отдельный
job подключается к VPS по SSH и запускает уже установленный
`/home/aparts-bansko/deploy/deploy.sh`. Одновременные production-деплои выполняются
последовательно и не прерывают друг друга.

### Отдельный SSH-ключ для GitHub Actions

Создавайте ключ на своем компьютере, а не внутри репозитория. Ключ не должен
иметь passphrase: GitHub Actions работает без интерактивного ввода. Комментарий
помогает позднее понять назначение ключа:

```sh
ssh-keygen -t ed25519 -C "github-actions-aparts-production" -f ~/.ssh/aparts_github_actions
```

Когда `ssh-keygen` спросит passphrase, дважды нажмите Enter. Будут созданы два
файла:

- `~/.ssh/aparts_github_actions` — приватный ключ; его содержимое добавляется
  только в GitHub Secret `DEPLOY_SSH_PRIVATE_KEY`;
- `~/.ssh/aparts_github_actions.pub` — публичный ключ; его нужно добавить на
  VPS в `~/.ssh/authorized_keys` пользователя, под которым выполняется деплой.

Скопируйте публичный ключ на VPS. Замените `deploy` и адрес сервера на реальные
SSH-пользователя и host:

```sh
ssh-copy-id -i ~/.ssh/aparts_github_actions.pub deploy@your-server.example.com
```

Если `ssh-copy-id` недоступен, выведите публичную часть командой
`cat ~/.ssh/aparts_github_actions.pub`, подключитесь к VPS обычным способом и
добавьте всю строку в `~/.ssh/authorized_keys`. На VPS проверьте права:

```sh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Пользователь деплоя должен владеть checkout `/home/aparts-bansko`, иметь право запускать
Docker без `sudo` и читать этот каталог. Обычно для этого его добавляют в группу
`docker`, после чего нужно выйти из SSH-сессии и войти снова:

```sh
sudo usermod -aG docker deploy
sudo chown -R deploy:deploy /home/aparts-bansko
```

До добавления ключа в GitHub проверьте его с компьютера:

```sh
ssh -i ~/.ssh/aparts_github_actions deploy@your-server.example.com \
  'cd /home/aparts-bansko && git status --short && docker compose version'
```

### GitHub Environment, secrets и variables

В GitHub откройте репозиторий, затем **Settings → Environments → New
environment**, создайте environment с точным именем `production`. Внутри него
добавьте Environment secrets:

- `DEPLOY_HOST` — домен или IP VPS без `https://`;
- `DEPLOY_USER` — SSH-пользователь, например `deploy`;
- `DEPLOY_SSH_PRIVATE_KEY` — полное содержимое приватного файла
  `~/.ssh/aparts_github_actions`, включая строки `BEGIN` и `END`;
- `DEPLOY_KNOWN_HOSTS` — закрепленный публичный SSH host key сервера.

`DEPLOY_KNOWN_HOSTS` получите на своем компьютере, где вы уже проверили SSH
fingerprint сервера:

```sh
ssh-keyscan -H -t ed25519 your-server.example.com
```

Не копируйте результат вслепую из непроверенной сети. Сверьте fingerprint с
выводом на самом VPS (`sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`),
а затем сохраните всю подтвержденную строку `ssh-keyscan` в secret. Если SSH
работает на нестандартном порту, используйте
`ssh-keyscan -H -t ed25519 -p PORT HOST`.

В разделе Environment variables при необходимости добавьте:

- `DEPLOY_PORT` — SSH-порт; без variable используется `22`;
- `DEPLOY_PATH` — путь checkout на VPS; без variable используется
  `/home/aparts-bansko`.

Значения из `.env.production` в GitHub переносить не нужно: workflow запускает
скрипт на VPS, а Docker Compose читает production-секреты непосредственно из
локального `/home/aparts-bansko/.env.production`.

После настройки можно запустить workflow вручную на вкладке **Actions → Deploy
production → Run workflow**. В дальнейшем каждый push в `main` автоматически
пройдет проверки и задеплоится. Ручной аварийный запуск на VPS остается тем же:

```sh
cd /home/aparts-bansko
./deploy/deploy.sh
```

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

## Гостевой сайт основного домена

`aparts-bansko.com` обслуживает отдельное Nuxt-приложение `guest/` на порту
`127.0.0.1:3001`. CRM остаётся на `crm.aparts-bansko.com:443` и локальном порту 3000.
Сервисы используют одну базу через публичный API CRM; у гостевого приложения нет
доступа к БД или закрытым API. Старый `deploy/site/` больше не используется.

Перед запуском заполните в `.env.production`:

На `/` расположены баннер, подборка первых трёх опубликованных апартаментов
в порядке каталога и блок о Вике. Полный каталог с картой доступен на `/apartments`;
страницы отдельных апартаментов остаются на `/apartments/:slug`.

- `NUXT_CATALOGUE_ORGANIZATION_ID` — UUID организации Вики из CRM, обязательно;
- `NUXT_PUBLIC_WHATSAPP` — реальный номер в международном формате без `+`;
- `NUXT_PUBLIC_SITE_URL=https://aparts-bansko.com`;
- `NUXT_PUBLIC_CATALOGUE_URL=https://aparts-bansko.com`;
- `NUXT_PUBLIC_HOST_NAME` и `NUXT_PUBLIC_HOST_DESCRIPTION` — текст блока «Обо мне»;
- фото Вики уже находится в `guest/public/images/vika.jpg` и показывается по умолчанию.
  `NUXT_PUBLIC_HOST_PHOTO` позволяет заменить локальный URL; пустое значение скрывает фото.

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
Дополнительные описания хозяина задаются через `NUXT_PUBLIC_HOST_DESCRIPTION_EN`,
`NUXT_PUBLIC_HOST_DESCRIPTION_HE` и `NUXT_PUBLIC_HOST_DESCRIPTION_BG`;
по умолчанию используются переведённые стандартные тексты.
На сайте показываются все фото в порядке галереи квартиры, главное фото — обложка.
Добавление, перестановка и удаление фото сразу отражаются на сайте.
Архивные/неактивные апартаменты не выдаются, удаление последнего фото снимает
публикацию. Скрытая страница и её фотографии возвращают 404.

Порядок первого запуска:

1. Соберите и поднимите CRM с миграцией и гостевой сервис через `deploy/deploy.sh`.
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

В локальном `.env` CRM задайте `NUXT_CATALOGUE_ORGANIZATION_ID` и
`NUXT_PUBLIC_CATALOGUE_URL=http://localhost:3001`. В `guest/.env` задайте
`NUXT_PUBLIC_SITE_URL=http://localhost:3001`,
`NUXT_CATALOGUE_API_BASE=http://localhost:3000` и `NUXT_PUBLIC_WHATSAPP`.
Оба `.env` игнорируются Git. Production-домены остаются значениями по умолчанию
в конфигурации; локальные порты в код компонентов не подставляются.

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

Автоматические резервные копии PostgreSQL и uploads в эту конфигурацию не
входят. До их добавления потеря Docker volumes означает потерю production-
данных и фотографий.

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
