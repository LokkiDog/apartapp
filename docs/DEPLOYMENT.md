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
- учетные данные внешнего SMTP;
- публичный и приватный VAPID-ключи;
- `NUXT_PUBLIC_APP_URL=https://crm.aparts-bansko.com`.

Для пароля PostgreSQL удобно использовать URL-safe hex, чтобы не кодировать
спецсимволы отдельно:

```sh
openssl rand -hex 32
openssl rand -base64 48
docker run --rm node:22-alpine sh -c "npx --yes web-push generate-vapid-keys"
```

Первое значение используйте одновременно в `POSTGRES_PASSWORD` и
`DATABASE_URL`, второе — как `NUXT_SESSION_PASSWORD`. Для STARTTLS задайте
`SMTP_PORT=587`, `SMTP_SECURE=false`; для SMTPS — `SMTP_PORT=465`,
`SMTP_SECURE=true`. `SMTP_USER` и `SMTP_PASSWORD` задаются вместе.

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

## Статическая заглушка основного домена

Основной домен `aparts-bansko.com` обслуживается отдельным virtual host и не
проксируется в CRM. После создания DNS A-записи на IP VPS установите пустую
HTML-страницу и временную HTTP-конфигурацию:

```sh
sudo mkdir -p /var/www/aparts-bansko
sudo cp deploy/site/index.html deploy/site/bansko-hero.jpg /var/www/aparts-bansko/
sudo cp deploy/nginx/aparts-site-http.conf /etc/nginx/sites-available/aparts-site
sudo ln -s /etc/nginx/sites-available/aparts-site /etc/nginx/sites-enabled/aparts-site
sudo nginx -t
sudo systemctl reload nginx
```

После проверки `http://aparts-bansko.com` выпустите отдельный сертификат и
включите HTTPS:

```sh
sudo certbot certonly --nginx -d aparts-bansko.com
sudo cp deploy/nginx/aparts-site.conf /etc/nginx/sites-available/aparts-site
sudo nginx -t
sudo systemctl reload nginx
curl --fail --show-error https://aparts-bansko.com/
```

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
