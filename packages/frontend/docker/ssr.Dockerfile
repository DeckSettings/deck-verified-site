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
RUN npm run build:ssr

FROM node:22-alpine

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/frontend/dist/ssr /app

WORKDIR /app

EXPOSE 9022

CMD ["npm", "run", "start"]
