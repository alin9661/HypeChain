"""Security + request-size middleware.

`SecurityHeadersMiddleware` replaces Express's `helmet()` with an explicit set of
response headers — explicit over a library here so the behavior is visible and
has no external API surface to drift.

`BodySizeLimitMiddleware` replaces Express's `express.json({ limit: '5mb' })`.
Starlette does not cap request bodies by default; AWS Lambda's synchronous
invocation payload limit is 6 MB, and base64-encoded product images inflate raw
bytes ~33%, so we reject declared bodies over 5 MB before reading them.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

MAX_BODY_BYTES = 5 * 1024 * 1024  # 5 MB, matching the Express cap

# Mirrors the defaults helmet() applies that are relevant to a JSON API.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-DNS-Prefetch-Control": "off",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"success": False, "error": "Request body too large (max 5MB)"},
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "error": "Invalid Content-Length header"},
                )
        return await call_next(request)
