# Use Node.js as the base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your backend listens on (e.g., 5000)
EXPOSE 8080

# Run the backend
CMD ["npm", "start"]
