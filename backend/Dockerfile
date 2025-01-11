FROM node:22-alpine as build

WORKDIR /app/backend

COPY ./backend/package*.json /app/backend
RUN npm ci

COPY ./backend /app/backend
COPY ./shared /app/shared
RUN npm run build

FROM node:22-alpine

WORKDIR /app/backend

COPY --from=build /app/backend/dist /app/dist
COPY --from=build /app/backend/package*.json /app/
COPY --from=build /app/backend/node_modules /app/node_modules

WORKDIR /app

EXPOSE 9022

CMD ["npm", "run", "serve"]
