# Testing Guide

## 1. Run Locally (Development)

Start the local development server:

```bash
npm run dev
```

This will start the worker at `http://localhost:8787`

## 2. Test Endpoints

### Process Feedback
Classify unprocessed feedback using AI:

```bash
curl http://localhost:8787/process
```

Or open in browser: http://localhost:8787/process

### Get Daily Summary
Generate a summary of today's processed feedback:

```bash
curl http://localhost:8787/summary
```

Or open in browser: http://localhost:8787/summary

## 3. Deploy and Test Remotely

Deploy to Cloudflare:

```bash
npm run deploy
```

Then test the deployed endpoints:

```bash
curl https://take-home.vladarava112.workers.dev/process
curl https://take-home.vladarava112.workers.dev/summary
```

## 4. Check Database

View feedback in the database:

```bash
# Local database
npx wrangler d1 execute feedback_db --command="SELECT * FROM feedback LIMIT 10;"

# Remote database
npx wrangler d1 execute feedback_db --command="SELECT * FROM feedback LIMIT 10;" --remote
```

