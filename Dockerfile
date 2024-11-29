# Example Dockerfile for node.js and canvas
FROM node:20-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory and copy package files
WORKDIR /app
COPY package.json package-lock.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the code
COPY . .

COPY assets/fonts /app/assets/fonts

# Expose the port and start the bot
EXPOSE 3000
CMD ["npm", "start"]
