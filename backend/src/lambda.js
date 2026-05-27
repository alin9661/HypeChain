// AWS Lambda entry point — wraps the Express app with serverless-http
// so the Lambda runtime can invoke it per HTTP request.
//
// The container CMD in backend/Dockerfile points at `lambda.handler`.
// Local dev uses src/dev.js (which calls app.listen) — never this file.
import serverless from 'serverless-http';
import app from './index.js';

export const handler = serverless(app);
