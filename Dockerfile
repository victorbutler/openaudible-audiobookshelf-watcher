FROM node:20-alpine

ENV INPUT=/input
ENV OUTPUT=/output

WORKDIR /app
COPY build/src /app/
COPY package.json package-lock.json /app/
RUN npm ci

VOLUME [ "/input", "/output" ]

CMD ["node", "app.js"]