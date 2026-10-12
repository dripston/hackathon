"""Manage separate module processes and verify their HTTP health endpoints."""
import asyncio
import logging
import os
import signal
from urllib.parse import urlsplit

import httpx

from .config import REPO_ROOT, Settings

log = logging.getLogger("uvicorn.error")


class Modules:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.processes: dict[str, asyncio.subprocess.Process] = {}
        self.status = {name: "connecting" for name in settings.modules}
        self.reported: dict[str, str] = {}
        self.all_connected = False
        self.watcher_attempted = False
        self.monitor: asyncio.Task | None = None

    async def healthy(self, name: str) -> bool:
        try:
            response = await self.client.get(self.settings.modules[name] + "/health", timeout=3)
            body = response.json()
            return response.status_code == 200 and isinstance(body, dict) and (
                body.get("service") == "telegram-voice-bot" and body.get("status") == "ok"
                if name == "voice" else body.get("ok") is True
            )
        except (httpx.HTTPError, ValueError):
            return False

    async def spawn(self, name: str, folder: str, command: list[str]) -> None:
        env = dict(os.environ)
        # Each module owns a separate uv environment, especially the two `app` packages.
        for key in ("VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT", "PYTHONPATH"):
            env.pop(key, None)
        env.update(PYTHONUNBUFFERED="1", PATIENT_URL=self.settings.detection_url,
                   SCORER_URL=self.settings.detection_url, ANTIBODY_URL=self.settings.antibody_url)
        self.processes[name] = await asyncio.create_subprocess_exec(
            "uv", "run", "--frozen", *command,
            cwd=REPO_ROOT / folder, env=env, start_new_session=True,
        )
        log.info("%s process launched (pid=%s)", name.capitalize(), self.processes[name].pid)

    async def start(self) -> None:
        if self.settings.autostart:
            origins = [urlsplit(url) for url in self.settings.modules.values()]
            ports = [origin.port or 80 for origin in origins]
            if len(set(ports)) != len(ports) or 8000 in ports:
                raise ValueError("Module ports must be distinct and must not use gateway port 8000")
            if any(origin.scheme != "http" or origin.hostname not in {"localhost", "127.0.0.1"} for origin in origins):
                raise ValueError("Autostart requires local HTTP origins; use GATEWAY_AUTOSTART=false for remote modules")
        for name, url in self.settings.modules.items():
            if await self.healthy(name):
                self.status[name] = "connected"
                continue  # Already-running modules are not ours to stop.
            if not self.settings.autostart:
                continue
            parsed = urlsplit(url)
            if parsed.hostname not in {"localhost", "127.0.0.1"}:
                raise ValueError("Autostart requires loopback module URLs; use GATEWAY_AUTOSTART=false for remote modules")
            port = parsed.port or 80
            if port == 8000:
                raise ValueError("Port 8000 is reserved for the gateway; use another module port")
            command = ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)] if name == "voice" else [name, "serve", "--host", "127.0.0.1", "--port", str(port)]
            try:
                await self.spawn(name, name, command)
            except OSError:
                self.status[name] = "launch_failed"
                log.error("%s module could not be launched; verify uv and module dependencies", name.capitalize())
        self.monitor = asyncio.create_task(self.watch(), name="module-connections")

    async def watch(self) -> None:
        began = asyncio.get_running_loop().time()
        while True:
            results = await asyncio.gather(*(self.healthy(name) for name in self.settings.modules))
            for name, healthy in zip(self.settings.modules, results):
                process = self.processes.get(name)
                if process and process.returncode is not None:
                    state = f"exited ({process.returncode})"
                elif healthy:
                    state = "connected"
                elif asyncio.get_running_loop().time() - began < self.settings.startup_timeout:
                    state = "connecting"
                else:
                    state = "unavailable"
                self.status[name] = state
                if self.reported.get(name) != state:
                    if state == "connected":
                        log.info("%s module connected with server", name.capitalize())
                    else:
                        log.warning("%s module %s; waiting for a successful health check", name.capitalize(), state)
                    self.reported[name] = state
            if self.settings.autostart and self.settings.watcher_enabled and not self.watcher_attempted and all(self.status[n] == "connected" for n in ("detection", "antibody")):
                self.watcher_attempted = True
                try:
                    await self.spawn("watcher", "antibody", ["antibody", "watch"])
                except OSError:
                    log.error("Antibody incident watcher failed to launch")
            watcher = self.processes.get("watcher")
            if watcher and watcher.returncode is not None and self.reported.get("watcher") != "exited":
                log.error("Antibody incident watcher exited (%s)", watcher.returncode)
                self.reported["watcher"] = "exited"
            connected = self.ready
            if connected and not self.all_connected:
                log.info("All backend modules successfully connected with server")
            elif self.all_connected and not connected:
                log.warning("Backend connection lost; see /ready for module status")
            self.all_connected = connected
            await asyncio.sleep(self.settings.check_interval)

    @property
    def ready(self) -> bool:
        connected = all(s == "connected" for s in self.status.values())
        if self.settings.autostart and self.settings.watcher_enabled:
            watcher = self.processes.get("watcher")
            return connected and watcher is not None and watcher.returncode is None
        return connected

    def report(self) -> dict:
        watcher = self.processes.get("watcher")
        return {"ok": self.ready, "modules": dict(self.status),
                "watcher": "running" if watcher and watcher.returncode is None else "stopped" if watcher else "not managed"}

    async def close(self) -> None:
        if self.monitor:
            self.monitor.cancel()
            await asyncio.gather(self.monitor, return_exceptions=True)
        # Process groups include uv and its Python child. Never stop pre-existing services.
        for process in self.processes.values():
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        for name, process in self.processes.items():
            try:
                await asyncio.wait_for(process.wait(), timeout=15)
            except asyncio.TimeoutError:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await process.wait()
            log.info("%s process stopped", name.capitalize())
