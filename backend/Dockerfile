FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY index.js ./

EXPOSE 9022

CMD ["npm", "start"]
