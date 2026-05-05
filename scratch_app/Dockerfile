FROM node:18-alpine
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* ./
RUN if [ -f yarn.lock ]; then yarn install; else npm install; fi
COPY . .
EXPOSE 3001
ENV PORT=3001
ENV VITE_BASE=./
CMD ["sh", "-c", "if [ -f yarn.lock ]; then yarn dev --host 0.0.0.0 --port 3001 --base ./; else npm run dev -- --host 0.0.0.0 --port 3001 --base ./; fi"]