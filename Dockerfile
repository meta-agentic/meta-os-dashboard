FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV API_HOST=0.0.0.0
ENV API_PORT=8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]