"""AWS Lambda entrypoint.

Wraps the ASGI app with Mangum (the Python equivalent of serverless-http). The
Lambda container `CMD` targets `app.lambda_handler.handler`.

`lifespan="off"` because Lambda manages the execution-environment lifecycle;
clients and the DB pool connect lazily and are reused across warm invocations
(see the module-level-singleton decision in the design spec).
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")
