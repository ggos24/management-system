FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

COPY . .

EXPOSE 3000

CMD ["npx", "vite", "--port", "3000"]
