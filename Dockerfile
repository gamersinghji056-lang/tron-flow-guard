FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
CMD ["npm", "run", "order:worker"]
