# HypeChain FastAPI backend — AWS Lambda container image.
# Mirrors the Node Lambda Dockerfile: install deps in a build stage, copy the
# app, target the handler. Uses uv for fast, reproducible installs.

FROM public.ecr.aws/lambda/python:3.13 AS build

# uv: copied from the official distroless image (no curl/pip bootstrap needed).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /build
COPY pyproject.toml uv.lock ./
# Export locked runtime deps and install into the Lambda task root.
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && uv pip install --system --target "${LAMBDA_TASK_ROOT}" -r requirements.txt

# ---- Runtime image ----
# nosemgrep: dockerfile.security.missing-user.missing-user
# No `USER` directive deliberately: AWS Lambda runs container images inside its
# own managed microVM sandbox under a runtime-controlled non-root user. Adding a
# USER here is unsupported by the Lambda runtime and can break access to
# LAMBDA_TASK_ROOT. Matches the proven Node Lambda image. False positive for
# Lambda base images — suppressed above.
FROM public.ecr.aws/lambda/python:3.13

COPY --from=build ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}
COPY app/ ${LAMBDA_TASK_ROOT}/app/
COPY schema/ ${LAMBDA_TASK_ROOT}/schema/

# Lambda Runtime Interface Client invokes this handler.
CMD ["app.lambda_handler.handler"]
