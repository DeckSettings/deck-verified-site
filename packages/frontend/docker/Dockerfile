FROM node:22-alpine AS build

WORKDIR /app
COPY ./packages/frontend/package*.json /app/packages/frontend/
COPY ./package*.json /app/
RUN npm ci --ignore-scripts

WORKDIR /app/packages/frontend
COPY ./packages/frontend/. /app/packages/frontend/
COPY ./packages/shared /app/packages/shared
ENV \
    VITE_ENABLE_LOGIN=true
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/packages/frontend/dist/spa /usr/share/nginx/html

COPY ./packages/frontend/docker/nginx/nginx.conf /etc/nginx/nginx.conf
