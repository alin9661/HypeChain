// AWS Lambda entry point — wraps the Express app with serverless-http
// so the Lambda runtime can invoke it per HTTP request.
//
// The container CMD in backend/Dockerfile points at `lambda.handler`.
// Local dev uses src/dev.js (which calls app.listen) — never this file.
import serverless from 'serverless-http';
import app from './index.js';
import { initServerWallet } from './services/signer.js';

const wrapped = serverless(app);

// Warm the custodial signer once per cold start. Required for the
// HACKNYU_CUSTODIAL_KEY_SOURCE=secretsmanager backend, whose Secrets Manager
// fetch is async and cannot run on the synchronous co-sign request path.
// Harmless for the env backend (loads synchronously). Cached across warm invokes;
// a failed load is retried on the next invocation rather than poisoning the cache.
let _warm = null;
export const handler = async (event, context) => {
  if (!_warm) {
    _warm = initServerWallet().catch((err) => {
      _warm = null;
      throw err;
    });
  }
  await _warm;
  return wrapped(event, context);
};
