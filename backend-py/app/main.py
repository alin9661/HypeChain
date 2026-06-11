"""FastAPI application factory.

Ports the Express app factory (`backend/src/index.js`): security headers, CORS,
5 MB body cap, request logging, health/root routes, and the 404 + global error
handlers — preserving the exact JSON error contract the frontend depends on.

Domain routers (listings, payments, activities, webhooks) are all wired in here.
The error contract and security middleware are shared across every route.
"""

import logging
import traceback

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config.settings import get_settings, require_marketplace_program_id
from app.middleware.cors import add_cors
from app.middleware.security import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.routers import activities, health, listings, payments, webhooks


def _configure_logging(is_dev: bool) -> None:
    """Minimal structlog setup — console renderer in dev, JSON in prod (CloudWatch)."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if is_dev else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging(settings.is_development)
    log = structlog.get_logger()

    # T8: fail loud at startup if the marketplace program ID is unset or still
    # the Anchor scaffold placeholder (outside dev/test). A half-configured
    # deploy must crash here rather than silently target the wrong program.
    require_marketplace_program_id()

    app = FastAPI(
        title="HypeChain Backend API",
        version="1.0.0",
        description="AI-Powered NFT Marketplace Backend with Solana Pay",
    )

    # Middleware. Order note: Starlette runs middleware in reverse of registration,
    # so the body-size guard (added last) executes first — rejecting oversized
    # uploads before any downstream work.
    add_cors(app)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)

    # Routes
    app.include_router(health.router)
    app.include_router(listings.router, prefix="/api")
    app.include_router(payments.router, prefix="/api/payments")
    app.include_router(activities.router, prefix="/api")
    app.include_router(webhooks.router, prefix="/api/webhooks")

    # ---- Error contract (ported from Express) ----

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Unmatched routes -> Express's 404 shape.
        if exc.status_code == 404:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Endpoint not found", "path": request.url.path},
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Always log the real error server-side; only expose it (and the stack)
        # to the client in development. In production the generic catch-all
        # returns a static message so unexpected exceptions don't leak internals.
        # (Deliberate per-route error detail, e.g. the create-listing pipeline's
        # failure_details, is produced by those handlers, not this catch-all.)
        log.error("server_error", error=str(exc), path=request.url.path)
        if settings.is_development:
            body = {"success": False, "error": str(exc) or "Internal server error",
                    "stack": traceback.format_exc()}
        else:
            body = {"success": False, "error": "Internal server error"}
        return JSONResponse(status_code=500, content=body)

    return app


app = create_app()
