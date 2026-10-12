"""Single HTTP entry point; module implementations remain in their own packages."""
from contextlib import asynccontextmanager
import re
import time
import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .config import Settings
from .modules import Modules

log = logging.getLogger("uvicorn.error")
# Fixed paths prevent the proxy from becoming an arbitrary URL/path forwarder.
ROUTES = {
    "antibody": {
        "GET": r"(?:health|overview|incidents|incidents/[A-Za-z0-9_-]+(?:/brief|/events)?|gate/latest|trust|evidence|aftercare|risks|drill/status)",
        "POST": r"(?:incidents/[A-Za-z0-9_-]+/(?:approve|reject)|webhooks/neatlogs|drill/start)",
    },
    "detection": {"GET": r"(?:health|runs|risks)", "POST": r"(?:run|score)"},
    "voice": {"GET": r"health", "POST": r"telegram/webhook"},
}


def create_app() -> FastAPI:
    settings = Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=settings.request_timeout, follow_redirects=False) as client:
            modules = Modules(settings, client)
            app.state.client, app.state.modules = client, modules
            try:
                await modules.start()
                log.info("Gateway started; checking backend module connections")
                yield
            finally:
                await modules.close()

    app = FastAPI(title="Antibody Unified Server", lifespan=lifespan)
    app.add_middleware(CORSMiddleware,
        allow_origins=[s.strip() for s in settings.cors_origins.split(",") if s.strip()],
        allow_methods=["GET", "POST"], allow_headers=["content-type", "x-telegram-bot-api-secret-token"],
        expose_headers=["x-antibody-mock"])

    @app.get("/")
    async def index():
        return {"service": "antibody-server", "docs": "/docs", "readiness": "/ready",
                "routes": {name: f"/api/{name}" for name in settings.modules},
                **app.state.modules.report()}

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "antibody-server"}

    @app.get("/ready")
    async def ready():
        report = app.state.modules.report()
        return JSONResponse(report, status_code=200 if report["ok"] else 503)

    async def forward(module: str, path: str, request: Request):
        pattern = ROUTES.get(module, {}).get(request.method)
        if not pattern or not re.fullmatch(pattern, path):
            return JSONResponse({"error": "Unknown module endpoint"}, status_code=404)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > settings.max_body_bytes:
                return JSONResponse({"error": "Request body too large"}, status_code=413)
        headers = {key: request.headers[key] for key in ("content-type", "accept", "x-telegram-bot-api-secret-token") if key in request.headers}
        started = time.monotonic()
        try:
            result = await app.state.client.request(request.method,
                settings.modules[module] + "/" + path, params=request.query_params.multi_items(),
                content=bytes(body), headers=headers)
        except httpx.TimeoutException:
            log.warning("%s module request timed out", module.capitalize())
            return JSONResponse({"error": f"{module.capitalize()} module timed out; outcome may be unknown"}, status_code=504)
        except httpx.HTTPError:
            log.warning("%s module request failed", module.capitalize())
            return JSONResponse({"error": f"{module.capitalize()} module unavailable"}, status_code=502)
        # Do not log payloads, queries, approval phrases or webhook secrets.
        log.info("%s module %s request completed: HTTP %s (%d ms)", module.capitalize(), request.method,
                 result.status_code, (time.monotonic() - started) * 1000)
        response_headers = {key: result.headers[key] for key in ("content-type", "x-antibody-mock", "retry-after") if key in result.headers}
        response_headers["cache-control"] = "no-store"
        return Response(content=result.content, status_code=result.status_code, headers=response_headers)

    @app.api_route("/api/{module}/{path:path}", methods=["GET", "POST"])
    async def module_request(module: str, path: str, request: Request):
        return await forward(module, path, request)

    # Voice registers this exact path with Telegram when using webhook mode.
    @app.post("/telegram/webhook")
    async def telegram_webhook(request: Request):
        return await forward("voice", "telegram/webhook", request)

    return app


app = create_app()
