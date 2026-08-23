# Production deployment

Aparts CRM разворачивается вручную по SSH на текущем VPS и доступна по адресу
`https://aparts.izvekov-alex.ru`. Контейнер приложения не публикует порт на
хосте: общий edge Nginx обращается к нему как к `aparts-app:3000` через внешнюю
Docker-сеть `main-network`.

## Перед первым запуском

Проверьте фактическую конфигурацию VPS до изменения общего proxy:

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker network inspect main-network
docker exec edge-nginx nginx -T
docker inspect edge-nginx --format '{{json .Mounts}}'
```

Эти команды должны подтвердить имя edge-контейнера, наличие `main-network`,
каталог Nginx-конфигураций, mounts `/etc/letsencrypt` и `/var/www/certbot`.
Не изменяйте Compose и checkout Flow Music при добавлении Aparts CRM.

Создайте DNS A-запись `aparts.izvekov-alex.ru` на IPv4 VPS. Добавляйте AAAA
только когда VPS действительно принимает IPv6-трафик. Перед выпуском
сертификата проверьте, что запись уже разрешается в адрес сервера:

```sh
dig +short A aparts.izvekov-alex.ru
dig +short AAAA aparts.izvekov-alex.ru
```

## Checkout и секреты

Пример использует `/opt/aparts`; каталог можно заменить, если все дальнейшие
команды выполняются из фактического checkout:

```sh
git clone https://github.com/LokkiDog/apartapp.git /opt/aparts
cd /opt/aparts
cp .env.production.example .env.production
chmod 600 .env.production
```

Заполните `.env.production`. Файл игнорируется Git и не должен попадать в
коммиты, логи или сообщения. Обязательные секреты:

- `POSTGRES_PASSWORD` и совпадающий с ним URL-encoded пароль в `DATABASE_URL`;
- `NUXT_SESSION_PASSWORD` длиной не менее 32 символов;
- email и надежный пароль первого администратора;
- учетные данные внешнего SMTP;
- публичный и приватный VAPID-ключи.

Сгенерировать секрет сессии и VAPID-ключи можно локально:

```sh
openssl rand -base64 48
npx web-push generate-vapid-keys
```

Для STARTTLS используйте `SMTP_PORT=587` и `SMTP_SECURE=false`. Для SMTPS
используйте `SMTP_PORT=465` и `SMTP_SECURE=true`. `SMTP_USER` и
`SMTP_PASSWORD` должны быть заданы вместе. `NUXT_PUBLIC_APP_URL` должен
оставаться равным `https://aparts.izvekov-alex.ru`.

Первый администратор создается идемпотентно при первом успешном старте. После
его создания изменение bootstrap-пароля в `.env.production` не меняет пароль
существующей учетной записи.

## Первый запуск и обновления

Проверьте production-конфигурацию и наличие общей сети:

```sh
docker network inspect main-network >/dev/null
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

Для первого запуска и каждого последующего обновления выполняйте:

```sh
cd /opt/aparts
./deploy/deploy.sh
```

Скрипт отказывается работать с грязным checkout, выполняет fast-forward из
`origin/main`, собирает app и migrate images, ждет PostgreSQL, останавливает
только старый app, применяет миграции и запускает новую версию. Ошибка сборки
не останавливает работающую версию; ошибка миграции не запускает новую.

Не редактируйте production checkout вручную. Все изменения должны приходить
из Git. Миграции PostgreSQL необратимы автоматически: откат к старому commit
допустим только при совместимой схеме данных.

## Edge Nginx и TLS

До выпуска сертификата поместите временный HTTP-only virtual host
`deploy/nginx/aparts-http.conf` в фактический каталог, смонтированный в
`/etc/nginx/conf.d` edge-контейнера. Он обслуживает ACME challenge, но не
открывает приложение по незащищенному HTTP. Перед reload проверьте
конфигурацию:

```sh
docker exec edge-nginx nginx -t
docker exec edge-nginx nginx -s reload
```

Если edge уже обслуживает `/.well-known/acme-challenge/` из общего webroot,
выпустите сертификат тем же Certbot-контейнером или host-командой, которая
используется для существующих доменов. Эквивалентная host-команда при
доступном `/var/www/certbot`:

```sh
certbot certonly --webroot -w /var/www/certbot -d aparts.izvekov-alex.ru
```

Если общего webroot нет, остановите edge-контейнер на короткое окно, выпустите
сертификат через `certbot certonly --standalone`, затем сразу запустите edge.
Не запускайте host `certbot --nginx`, когда Nginx работает внутри Docker.

После появления сертификата замените временный файл полным virtual host из
`deploy/nginx/aparts.conf`, затем повторно выполните `nginx -t` и reload.
Полный шаблон устанавливает HTTPS-редирект, proxy-заголовки и лимит запроса
10 МБ для приложения, которое принимает фотографии размером до 8 МБ.

## Проверка и диагностика

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 app
curl --fail --show-error https://aparts.izvekov-alex.ru/api/health
curl --fail --show-error --head https://aparts.izvekov-alex.ru/manifest.webmanifest
```

Healthcheck возвращает только `{ "status": "ok" }` после успешного запроса к
PostgreSQL. Проверьте вход bootstrap-администратором и отправьте приглашение на
контролируемый email для проверки SMTP. Убедитесь, что app имеет mount
`aparts_uploads_data` после пересоздания контейнера.

Автоматические резервные копии PostgreSQL и uploads в эту конфигурацию не
входят. До их добавления потеря Docker volumes означает потерю production-
данных и фотографий.
