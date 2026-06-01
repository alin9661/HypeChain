"""Security + request-size middleware.

`SecurityHeadersMiddleware` replaces Express's `helmet()` with an explicit set of
response headers — explicit over a library here so the behavior is visible and
has no external API surface to drift.

`BodySizeLimitMiddleware` replaces Express's `express.json({ limit: '5mb' })`.
Starlette does not cap request bodies by default; AWS Lambda's synchronous
invocation payload limit is 6 MB, and base64-encoded product images inflate raw
bytes ~33%, so we reject declared bodies over 5 MB before reading them.
"""

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

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


class BodySizeLimitMiddleware:
    """Reject request bodies over MAX_BODY_BYTES — replacing Express's
    express.json({ limit: '5mb' }), which capped during the read.

    A pure-ASGI middleware (not BaseHTTPMiddleware) so it can cap the body as it
    streams in. It does NOT trust the Content-Length header alone: a chunked
    request with no/forged Content-Length is still capped while reading, closing
    the bypass a header-only check would leave open. Memory is bounded — once the
    accumulated body exceeds the limit we short-circuit with 413 immediately,
    never buffering more than the cap.
    """

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Fast reject: an honestly-declared oversized Content-Length.
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > self.max_bytes:
                        await self._reject(send, 413, "Request body too large (max 5MB)")
                        return
                except ValueError:
                    await self._reject(send, 400, "Invalid Content-Length header")
                    return
                break

        # Buffer the body, capping as we read (covers chunked / absent CL).
        chunks: list[bytes] = []
        total = 0
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                # Client went away; replay the disconnect to the app.
                async def disconnected_receive():
                    return {"type": "http.disconnect"}

                await self.app(scope, disconnected_receive, send)
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                await self._reject(send, 413, "Request body too large (max 5MB)")
                return
            chunks.append(chunk)
            more_body = message.get("more_body", False)

        body = b"".join(chunks)
        replayed = False

        async def buffered_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(scope, buffered_receive, send)

    @staticmethod
    async def _reject(send, status: int, message: str) -> None:
        body = json.dumps({"success": False, "error": message}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
