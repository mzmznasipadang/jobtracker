# Node 24 comes with the image; browsers live in /ms-playwright. The tag must match playwright-core in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
# better-sqlite3 falls back to node-gyp when installing on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
# Keep both the web app and Chromium under the non-root image user (uid 1001).
RUN mkdir /data && chown pwuser:pwuser /app /data
USER pwuser
COPY --chown=pwuser:pwuser package.json package-lock.json ./
RUN npm ci
COPY --chown=pwuser:pwuser . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
