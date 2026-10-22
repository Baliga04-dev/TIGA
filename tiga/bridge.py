"""Tiga Bridge: talk to the owner's real Edge tabs through the Tiga Bridge extension.

Interface: `bridge.connected()`, `await bridge.call(command, args) -> dict` (raises BridgeError when the
extension isn't connected, times out or reports an error), `attach(ws)` / `detach(ws)` used by the
WebSocket route, and `resolve(message)` for replies. One extension connection at a time.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any


class BridgeError(RuntimeError):
    pass


class Bridge:
    def __init__(self) -> None:
        self._ws: Any = None
        self._pending: dict[str, asyncio.Future] = {}

    def connected(self) -> bool:
        return self._ws is not None

    def attach(self, ws: Any) -> None:
        self._ws = ws

    def detach(self, ws: Any) -> None:
        if self._ws is ws:
            self._ws = None
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(BridgeError("the browser extension disconnected"))
            self._pending.clear()

    async def call(self, command: str, args: dict | None = None, timeout: float = 10) -> dict:
        if self._ws is None:
            raise BridgeError("the Tiga Bridge extension isn't connected; open Edge and check Settings")
        request_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._ws.send_json({"id": request_id, "cmd": command, "args": args or {}})
            reply = await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError as exc:
            raise BridgeError("the browser didn't answer in time") from exc
        finally:
            self._pending.pop(request_id, None)
        if reply.get("error"):
            raise BridgeError(str(reply["error"])[:300])
        return reply.get("result") or {}

    def resolve(self, message: dict) -> None:
        future = self._pending.get(str(message.get("id", "")))
        if future and not future.done():
            future.set_result(message)


bridge = Bridge()
