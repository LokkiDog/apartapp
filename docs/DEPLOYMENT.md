# Production deployment

Aparts CRM разворачивается вручную по SSH на отдельном VPS и доступна по адресу
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

Пример использует `/opt/aparts`; замените путь, если checkout уже находится в
другом каталоге:

```sh
sudo git clone https://github.com/LokkiDog/apartapp.git /opt/aparts
sudo chown -R "$USER":"$USER" /opt/aparts
cd /opt/aparts
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

## Первый запуск и обновления

Проверьте production-конфигурацию:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

Для первого запуска и каждого обновления выполняйте:

```sh
cd /opt/aparts
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
