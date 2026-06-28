# AWS Lambda container image for the HypeChain backend.
#
# Why a container image instead of a zipped Lambda?
#   Our deps (full Metaplex Umi stack + Solana web3 + pg/DSQL signer + OpenAI
#   SDK) exceed Lambda's 250 MB unzipped zip limit. Container images go up
#   to 10 GB and let us pin Node 20 explicitly.
#
# Why public.ecr.aws/lambda/nodejs:20?
#   AWS's official Node.js 20 base. It ships with the Lambda Runtime
#   Interface Client (RIC) preinstalled and the ENTRYPOINT wired to bootstrap
#   the RIC — so we only need to set CMD to point at our handler.
#
# Build:   sam build           (from backend/, uses SAM's docker driver)
# Deploy:  sam deploy --guided (pushes to ECR, updates the Lambda)
# Local:   docker build -t hypechain-backend . && docker run -p 9000:8080 hypechain-backend

FROM public.ecr.aws/lambda/nodejs:20

# Install bun into the AWS Lambda Node.js base. We keep the AWS-managed base
# (not oven/bun) so the Lambda Runtime Interface Client and ENTRYPOINT stay
# intact — bun is only used to install dependencies; Node runs the handler.
# Pinning bun's version keeps the container build deterministic with local
# installs that read backend/bun.lock.
ARG BUN_VERSION=1.1.38
# Pick the bun build that matches the image arch. The function targets arm64
# (template.yaml Architectures: arm64), so on an arm64 image we MUST install the
# aarch64 bun — the x64 build would die under rosetta with
# "failed to open elf at /lib64/ld-linux-x86-64.so.2". Detect at build time so
# the same Dockerfile works for an x86_64 target too.
RUN microdnf install -y unzip tar gzip \
    && case "$(uname -m)" in \
         aarch64|arm64) BUN_ARCH=aarch64 ;; \
         x86_64) BUN_ARCH=x64 ;; \
         *) echo "unsupported arch: $(uname -m)" && exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" -o /tmp/bun.zip \
    && unzip -q /tmp/bun.zip -d /tmp \
    && mv /tmp/bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH} \
    && microdnf clean all

# Lambda's base image sets WORKDIR to /var/task automatically — that's where
# the RIC looks for the handler file referenced by CMD.
COPY package.json bun.lock ./

# Production deps only; --frozen-lockfile rejects any drift from the lockfile.
RUN bun install --production --frozen-lockfile

# Copy application source. .dockerignore excludes secrets, host node_modules,
# the dev entry, and the railway/render configs.
COPY src/ ./src/

# Defense-in-depth: drop to a non-root UID for handler execution.
# Lambda's runtime already sandboxes invocations (its RIC manages process
# isolation), but an explicit non-root USER satisfies CWE-250 and protects
# us if AWS ever changes that contract. COPY's default 644/755 perms leave
# /var/task world-readable, so this UID can still load the handler.
USER 1001

# Lambda CMD format: "<file-path-without-ext>.<exported-handler-name>"
# Resolves to /var/task/src/lambda.js exporting `handler`.
CMD [ "src/lambda.handler" ]
