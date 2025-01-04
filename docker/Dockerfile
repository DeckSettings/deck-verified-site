FROM node:22-alpine as build

WORKDIR /app

COPY . ./

RUN npm ci

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist/spa /usr/share/nginx/html/deck-verified

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf 
