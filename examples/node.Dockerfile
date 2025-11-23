# Usa Node 20 en Alpine para imágenes livianas
FROM node:20-alpine

WORKDIR /app

# Copiar package.json y lock para instalar dependencias
COPY package*.json ./
RUN npm install --omit=dev

# Copiar código fuente
COPY . .

# Si usás TypeScript, compilar antes de ejecutar
RUN npx tsc

# Iniciar el agente
CMD ["node", "dist/bot.js"]
