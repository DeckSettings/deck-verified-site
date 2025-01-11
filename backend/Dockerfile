FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY *.cjs ./

RUN npm run build

EXPOSE 9022

CMD ["npm", "start"]
