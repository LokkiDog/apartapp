FROM node:22-alpine AS dependencies

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

ENV NODE_OPTIONS=--max-old-space-size=1536

COPY . .
RUN npm run prepare && npm run build

FROM dependencies AS migrate

COPY drizzle.config.ts ./
COPY server/infrastructure/database ./server/infrastructure/database
CMD ["npm", "run", "db:migrate"]

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    PORT=3000 \
    FILE_STORAGE_PATH=/app/.data/uploads

COPY --from=build --chown=node:node /app/.output ./.output
RUN mkdir -p /app/.data/uploads && chown -R node:node /app/.data

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
