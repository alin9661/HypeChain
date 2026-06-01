# How-to: Deploy to AWS Lambda

Package the backend as a Lambda container image and run it behind a Function URL. This mirrors
the existing Express deployment, so the frontend cuts over by changing one `BACKEND_URL`.

## Prerequisites
- Docker, the AWS CLI configured, and an ECR repository.
- An IAM execution role for the function (with `dsql:DbConnectAdmin` if using DSQL — see
  [How-to: Configure Aurora DSQL](howto-configure-dsql.md)).

## How it's wired

`app/lambda_handler.py` adapts the ASGI app for Lambda:
```python
from mangum import Mangum
from app.main import app
handler = Mangum(app, lifespan="off")
```
`lifespan="off"` because Lambda owns the process lifecycle; clients and the DB pool connect
lazily and are reused across warm invocations. The `Dockerfile` targets
`public.ecr.aws/lambda/python:3.13` and sets `CMD ["app.lambda_handler.handler"]`.

> **No `USER` directive** in the Dockerfile is deliberate: Lambda runs container images in its
> own managed non-root sandbox, and adding `USER` can break access to `LAMBDA_TASK_ROOT`. A
> documented `# nosemgrep` suppression covers the scanner warning.

## Step 1: Test the image locally with the Lambda RIE

```bash
cd backend-py
docker build -t hypechain-backend-py .
docker run --rm -p 9000:8080 hypechain-backend-py
```

In another terminal, invoke through the Runtime Interface Emulator:

```bash
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"version":"2.0","rawPath":"/health","requestContext":{"http":{"method":"GET"}},"headers":{}}'
```

You should get the health JSON back inside the Lambda response envelope.

## Step 2: Push to ECR and deploy

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"

docker tag hypechain-backend-py:latest "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/hypechain-backend-py:latest"
docker push "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/hypechain-backend-py:latest"
```

Update (or create) the function to use the new image — via your existing SAM template, the
console, or `aws lambda update-function-code --function-name <name> --image-uri <uri>`.

## Step 3: Set environment variables

Set every `HACKNYU_*` key your deployment needs (see [Reference: Configuration](reference-configuration.md))
on the function. Leave `NODE_ENV` unset or `production` (it's fail-closed). AWS credentials for
the DSQL IAM token come from the execution role, not an env var.

## Step 4: Configure the Function URL

- Buffered invoke mode (default) caps the response at 6MB; the app enforces a 5MB request-body
  cap to match.
- Apply throttling at the Function URL / API Gateway layer (app-level rate limiting was
  intentionally removed — see [Design decisions](explanation-design-decisions.md)).
- Point a **preview/staging** frontend at the new Function URL before flipping production
  `BACKEND_URL`.

## Verification
- RIE invocation of `/health` returns `"status":"healthy"`.
- After deploy, `curl https://<function-url>/health` succeeds.
- A staging frontend can complete a request end-to-end.

## Troubleshooting
- **Handler import error** → confirm `CMD` is `app.lambda_handler.handler` and `app/` is copied
  into `LAMBDA_TASK_ROOT`.
- **DB auth failures** → the execution role lacks `dsql:DbConnectAdmin`, or `HACKNYU_DSQL_*` is
  wrong (see the DSQL how-to).
- **413 on uploads** → request body exceeds 5MB; use a smaller image.

## Related
- [How-to: Configure Aurora DSQL](howto-configure-dsql.md) · [Explanation: Architecture](explanation-architecture.md)
