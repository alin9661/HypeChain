#!/usr/bin/env bash
#
# deploy.sh — parameterized, idempotent deploy driver for the HypeChain
# FastAPI backend (backend-py/) as an AWS Lambda container image behind a
# Function URL.
#
# PREP / SAFETY MODEL
#   This script is DRY-RUN BY DEFAULT. Without --apply (or CONFIRM=1) it only
#   PRINTS the `aws` / `docker` commands it WOULD run — it executes nothing that
#   touches AWS, ECR, or Docker. The operator runs the AWS-authenticated steps
#   themselves by re-running with --apply once they trust the plan.
#
#   - No credentials or secrets are embedded. AWS auth comes from the operator's
#     ambient credential chain (env / profile / role). App secrets are set on
#     the Lambda separately (see deploy/SECRETS.md), NOT here.
#   - Mirrors the wiring in backend-py/Dockerfile (handler app.lambda_handler.handler,
#     base image public.ecr.aws/lambda/python:3.13, arm64) and the Function-URL
#     / no-API-Gateway design from backend/template.yaml.
#
# Prefer `sam deploy` (see backend/template.yaml) when you want CloudFormation to
# manage the whole stack. Use THIS script for a direct image build+push+update
# loop when you are iterating on the function out-of-band.
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults (override via flags or env vars)
# ---------------------------------------------------------------------------
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO_URI="${ECR_REPO_URI:-}"          # e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/hypechain-backend-py
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-hypechain-backend-py}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN:-}"    # required only on FIRST create-function
LAMBDA_MEMORY="${LAMBDA_MEMORY:-1024}"    # MB — matches template.yaml
LAMBDA_TIMEOUT="${LAMBDA_TIMEOUT:-900}"   # s  — matches template.yaml (max)
LAMBDA_ARCH="${LAMBDA_ARCH:-arm64}"       # matches template.yaml Architectures

# Reserved concurrency throttle at the function level (see deploy/THROTTLING.md).
# Empty = leave concurrency unmanaged (account default). Set to a number to cap.
RESERVED_CONCURRENCY="${RESERVED_CONCURRENCY:-}"

# Build context = the backend-py/ directory (where the Dockerfile lives), resolved
# relative to this script so the driver works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_CONTEXT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE="${BUILD_CONTEXT}/Dockerfile"

# Lambda container images are invoked through their CMD; we assert the handler so
# the operator's expectation is documented next to the command.
EXPECTED_HANDLER="app.lambda_handler.handler"

# Dry-run unless explicitly confirmed.
APPLY=0
[ "${CONFIRM:-0}" = "1" ] && APPLY=1

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<'EOF'
Usage: deploy.sh [options]

Build the backend-py Lambda container image, push it to ECR, create-or-update the
Lambda function from that image, and ensure a Function URL exists.

DRY-RUN by default: prints every aws/docker command without running it.
Pass --apply (or CONFIRM=1) to actually execute.

Options (all also settable via env var of the same UPPER_SNAKE name):
  --region <r>            AWS region            (env AWS_REGION,            default us-east-1)
  --ecr-repo-uri <uri>    ECR repo URI          (env ECR_REPO_URI,         REQUIRED)
  --function-name <name>  Lambda function name  (env LAMBDA_FUNCTION_NAME, default hypechain-backend-py)
  --image-tag <tag>       Image tag             (env IMAGE_TAG,            default latest)
  --role-arn <arn>        Execution role ARN    (env LAMBDA_ROLE_ARN,      required on first create)
  --memory <mb>           Function memory       (env LAMBDA_MEMORY,        default 1024)
  --timeout <s>           Function timeout      (env LAMBDA_TIMEOUT,       default 900)
  --arch <arch>           arm64 | x86_64        (env LAMBDA_ARCH,          default arm64)
  --reserved-concurrency <n>  Reserved concurrency cap (env RESERVED_CONCURRENCY, default unset)
  --apply                 Execute the commands  (env CONFIRM=1)
  -h, --help              Show this help

Examples:
  # Preview the full plan (no AWS/docker calls):
  ECR_REPO_URI=123.dkr.ecr.us-east-1.amazonaws.com/hypechain-backend-py ./deploy.sh

  # First-ever deploy (creates the function), executing for real:
  ./deploy.sh --ecr-repo-uri <uri> --role-arn <execution-role-arn> --apply

  # Subsequent deploy of a new tag:
  ./deploy.sh --ecr-repo-uri <uri> --image-tag v2 --apply
EOF
}

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --region)               AWS_REGION="$2"; shift 2 ;;
    --ecr-repo-uri)         ECR_REPO_URI="$2"; shift 2 ;;
    --function-name)        LAMBDA_FUNCTION_NAME="$2"; shift 2 ;;
    --image-tag)            IMAGE_TAG="$2"; shift 2 ;;
    --role-arn)             LAMBDA_ROLE_ARN="$2"; shift 2 ;;
    --memory)               LAMBDA_MEMORY="$2"; shift 2 ;;
    --timeout)              LAMBDA_TIMEOUT="$2"; shift 2 ;;
    --arch)                 LAMBDA_ARCH="$2"; shift 2 ;;
    --reserved-concurrency) RESERVED_CONCURRENCY="$2"; shift 2 ;;
    --apply)                APPLY=1; shift ;;
    -h|--help)              usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [ -z "$ECR_REPO_URI" ]; then
  echo "ERROR: ECR_REPO_URI is required (flag --ecr-repo-uri or env ECR_REPO_URI)." >&2
  echo "       e.g. 123456789012.dkr.ecr.${AWS_REGION}.amazonaws.com/hypechain-backend-py" >&2
  exit 2
fi
if [ ! -f "$DOCKERFILE" ]; then
  echo "ERROR: Dockerfile not found at $DOCKERFILE" >&2
  exit 2
fi

# Derive the ECR registry host (everything before the first '/') for docker login.
ECR_REGISTRY="${ECR_REPO_URI%%/*}"
IMAGE_URI="${ECR_REPO_URI}:${IMAGE_TAG}"
LOCAL_IMAGE="${LAMBDA_FUNCTION_NAME}:${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# run() — echo every command; execute only under --apply/CONFIRM=1.
# ---------------------------------------------------------------------------
run() {
  echo "+ $*"
  if [ "$APPLY" = "1" ]; then
    "$@"
  fi
}

echo "=========================================================================="
echo " HypeChain backend-py — Lambda container deploy"
echo "   region            : $AWS_REGION"
echo "   ecr repo uri      : $ECR_REPO_URI"
echo "   image uri         : $IMAGE_URI"
echo "   function name     : $LAMBDA_FUNCTION_NAME"
echo "   handler (CMD)     : $EXPECTED_HANDLER"
echo "   architecture      : $LAMBDA_ARCH"
echo "   memory / timeout  : ${LAMBDA_MEMORY}MB / ${LAMBDA_TIMEOUT}s"
echo "   reserved concrcy  : ${RESERVED_CONCURRENCY:-<unmanaged>}"
echo "   build context     : $BUILD_CONTEXT"
if [ "$APPLY" = "1" ]; then
  echo "   MODE              : APPLY (commands WILL run)"
else
  echo "   MODE              : DRY-RUN (printing commands only; pass --apply to execute)"
fi
echo "=========================================================================="

# ---------------------------------------------------------------------------
# Step 1: build the image from backend-py/Dockerfile
# ---------------------------------------------------------------------------
echo
echo "--- Step 1: build container image (arch $LAMBDA_ARCH) ---"
# --provenance=false keeps the manifest a plain image (Lambda rejects OCI image
# indexes from some buildx configurations). --platform pins the Lambda arch.
run docker build \
  --platform "linux/${LAMBDA_ARCH}" \
  --provenance=false \
  -f "$DOCKERFILE" \
  -t "$LOCAL_IMAGE" \
  "$BUILD_CONTEXT"

# ---------------------------------------------------------------------------
# Step 2: authenticate Docker to ECR
# ---------------------------------------------------------------------------
echo
echo "--- Step 2: authenticate to ECR ---"
if [ "$APPLY" = "1" ]; then
  # Real auth: pipe the ECR password into docker login. Printed form (below) is
  # shown for the dry-run path so no token is ever emitted.
  echo "+ aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY"
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$ECR_REGISTRY"
else
  echo "+ aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY"
fi

# ---------------------------------------------------------------------------
# Step 3: tag + push to ECR
# ---------------------------------------------------------------------------
echo
echo "--- Step 3: tag + push image to ECR ---"
run docker tag "$LOCAL_IMAGE" "$IMAGE_URI"
run docker push "$IMAGE_URI"

# ---------------------------------------------------------------------------
# Step 4: create-or-update the Lambda function from the image (idempotent)
# ---------------------------------------------------------------------------
echo
echo "--- Step 4: create-or-update Lambda function (idempotent) ---"
# Probe existence. In dry-run we cannot know, so we PRINT both branches and
# default the plan to the update path (the common case after first deploy).
FUNCTION_EXISTS=0
if [ "$APPLY" = "1" ]; then
  if aws lambda get-function \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
    FUNCTION_EXISTS=1
  fi
fi

if [ "$APPLY" = "1" ] && [ "$FUNCTION_EXISTS" = "0" ]; then
  # ---- create path ----
  if [ -z "$LAMBDA_ROLE_ARN" ]; then
    echo "ERROR: function '$LAMBDA_FUNCTION_NAME' does not exist and LAMBDA_ROLE_ARN is unset." >&2
    echo "       Provide --role-arn <execution-role-arn> for the first create." >&2
    exit 2
  fi
  run aws lambda create-function \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --package-type Image \
    --code "ImageUri=${IMAGE_URI}" \
    --role "$LAMBDA_ROLE_ARN" \
    --architectures "$LAMBDA_ARCH" \
    --memory-size "$LAMBDA_MEMORY" \
    --timeout "$LAMBDA_TIMEOUT" \
    --region "$AWS_REGION"
else
  # ---- update path (also the default printed plan in dry-run) ----
  [ "$APPLY" = "0" ] && echo "  (dry-run: assuming function exists; if first deploy, the create path runs instead — see --role-arn)"
  run aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" \
    --architectures "$LAMBDA_ARCH" \
    --region "$AWS_REGION"
  # Keep config in sync with the template intent on every update.
  run aws lambda update-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --memory-size "$LAMBDA_MEMORY" \
    --timeout "$LAMBDA_TIMEOUT" \
    --region "$AWS_REGION"
fi

# ---------------------------------------------------------------------------
# Step 5: reserved concurrency throttle (optional — see deploy/THROTTLING.md)
# ---------------------------------------------------------------------------
echo
echo "--- Step 5: reserved concurrency (throttle) ---"
if [ -n "$RESERVED_CONCURRENCY" ]; then
  run aws lambda put-function-concurrency \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --reserved-concurrent-executions "$RESERVED_CONCURRENCY" \
    --region "$AWS_REGION"
else
  echo "  (skipped: RESERVED_CONCURRENCY unset — concurrency left unmanaged)"
fi

# ---------------------------------------------------------------------------
# Step 6: ensure a Function URL exists (idempotent)
# ---------------------------------------------------------------------------
echo
echo "--- Step 6: ensure Function URL exists ---"
# AuthType NONE matches template.yaml (app does wallet-signature auth, not IAM).
URL_EXISTS=0
if [ "$APPLY" = "1" ]; then
  if aws lambda get-function-url-config \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
    URL_EXISTS=1
  fi
fi

if [ "$APPLY" = "1" ] && [ "$URL_EXISTS" = "1" ]; then
  echo "  (function URL already exists; leaving config as-is)"
else
  [ "$APPLY" = "0" ] && echo "  (dry-run: creates the URL if absent; no-op if it already exists)"
  run aws lambda create-function-url-config \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --auth-type NONE \
    --invoke-mode BUFFERED \
    --region "$AWS_REGION"
  # NONE auth requires an explicit resource policy permitting public invoke.
  run aws lambda add-permission \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$AWS_REGION"
fi

# ---------------------------------------------------------------------------
# Step 7: print the Function URL for the cutover runbook
# ---------------------------------------------------------------------------
echo
echo "--- Step 7: resolve Function URL (feed into deploy/CUTOVER.md) ---"
run aws lambda get-function-url-config \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION" \
  --query FunctionUrl \
  --output text

echo
if [ "$APPLY" = "1" ]; then
  echo "Done. Next: run deploy/smoke-test.sh <function-url>, then follow deploy/CUTOVER.md."
else
  echo "Dry-run complete. Re-run with --apply (or CONFIRM=1) to execute."
fi
