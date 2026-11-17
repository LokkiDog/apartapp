FROM node:22-alpine AS dependencies

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

ARG CRM_BRAND=aparts
ARG CRM_APP_URL=http://localhost:3000
ENV CRM_BRAND=$CRM_BRAND NUXT_PUBLIC_APP_URL=$CRM_APP_URL

ENV NODE_OPTIONS=--max-old-space-size=1536

COPY . .
RUN export DATABASE_URL="postgres://build:build@127.0.0.1:1/${CRM_BRAND}" \
    && npm run prepare && npm run build

FROM dependencies AS migrate

COPY drizzle.config.ts ./
COPY shared/config/crm-database.ts shared/config/load-crm-env.ts ./shared/config/
COPY server/infrastructure/database ./server/infrastructure/database
CMD ["npm", "run", "db:migrate"]

FROM node:22-alpine AS runtime

ARG CRM_BRAND=aparts
WORKDIR /app
ENV NODE_ENV=production \
    CRM_BRAND=$CRM_BRAND \
    NITRO_HOST=0.0.0.0 \
    PORT=3000 \
    FILE_STORAGE_PATH=/app/.data/uploads

COPY --from=build --chown=node:node /app/.output ./.output
RUN mkdir -p /app/.data/uploads && chown -R node:node /app/.data

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

FROM dependencies AS guest-build
COPY . .
RUN npm run build:guest

FROM node:22-alpine AS guest-runtime
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 PORT=3001
COPY --from=guest-build --chown=node:node /app/guest/.output ./.output
USER node
EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
