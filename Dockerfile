FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci
COPY . .
RUN npm run build:release

FROM node:20-alpine AS run

ENV INPUT=/input
ENV OUTPUT=/output
ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/build/src/ /app/
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev

VOLUME [ "/input", "/output" ]

CMD ["node", "app.js"]