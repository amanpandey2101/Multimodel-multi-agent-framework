FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* ./
RUN if [ -f yarn.lock ]; then yarn install; else npm install; fi
COPY . .
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["sh", "-c", "if [ -f yarn.lock ]; then yarn dev -p 3001; else npm run dev -- -p 3001; fi"]