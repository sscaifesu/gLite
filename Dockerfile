FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build:css

FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/server.js .

RUN mkdir -p uploads compressed && \
    groupadd -r glite && \
    useradd -r -g glite glite && \
    chown -R glite:glite /usr/src/app

USER glite

EXPOSE 3000

CMD [ "node", "server.js" ]
