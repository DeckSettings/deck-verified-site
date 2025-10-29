FROM node:22-alpine AS build

WORKDIR /app
COPY ./packages/backend/package*.json /app/packages/backend/
COPY ./package*.json /app/
RUN npm ci

WORKDIR /app/packages/backend
COPY ./packages/backend/src /app/packages/backend/src
COPY ./packages/backend/*.json /app/packages/backend/
COPY ./packages/shared /app/packages/shared
RUN npm run build

FROM node:22-alpine

WORKDIR /app/backend

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/backend/dist /app/dist
COPY --from=build /app/packages/backend/package.json /app/

WORKDIR /app

EXPOSE 9022

ENV NODE_OPTIONS="--no-network-family-autoselection"

CMD ["npm", "run", "serve"]
