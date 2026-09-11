FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install
RUN npm --prefix client install

# Copy source code and shapefiles
COPY . .

# Build frontend
RUN npm --prefix client run build

# Default environment
ENV NODE_ENV=production
ENV PORT=5000
ENV ENABLE_UPLOADS=false

EXPOSE 5000

CMD ["npm", "start"]
