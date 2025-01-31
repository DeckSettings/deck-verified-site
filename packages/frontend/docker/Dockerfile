FROM node:22-alpine AS build

WORKDIR /app
COPY ./packages/frontend/package*.json /app/packages/frontend/
COPY ./package*.json /app/
RUN npm ci --ignore-scripts

WORKDIR /app/packages/frontend
COPY ./packages/frontend/. /app/packages/frontend/
COPY ./packages/shared /app/packages/shared
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/packages/frontend/dist/spa /usr/share/nginx/html/deck-verified

COPY ./packages/frontend/docker/nginx/default.conf /etc/nginx/conf.d/default.conf
