# AWS Lambda container image for the HypeChain backend.
#
# Why a container image instead of a zipped Lambda?
#   Our deps (full Metaplex Umi stack + Solana web3 + Supabase SDK + OpenAI
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

# Enable pnpm via corepack (bundled with Node 16+). Pinning to the lockfile's
# pnpm version keeps the container build deterministic with local installs.
RUN corepack enable && corepack prepare pnpm@10.12.3 --activate

# Lambda's base image sets WORKDIR to /var/task automatically — that's where
# the RIC looks for the handler file referenced by CMD.
COPY package.json pnpm-lock.yaml ./

# Production deps only; --frozen-lockfile rejects any drift from the lockfile.
RUN pnpm install --prod --frozen-lockfile

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
