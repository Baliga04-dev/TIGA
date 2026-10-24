"""Routes for the Lab page (ShopLab). Hidden, like Learn, unless TIGA_LEARN_ENABLED is set.

Starting the lab builds images and can take minutes, so it runs in the background and /status says so.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import lab as lab_mod
import services
from learn import _require_enabled

router = APIRouter(prefix="/api/lab", dependencies=[Depends(_require_enabled)])
_job: dict = {"running": None, "last": None}


def _lab() -> lab_mod.Lab:
    return lab_mod.Lab(store=services.get_store())


@router.get("/status")
async def status() -> dict:
    out = await asyncio.to_thread(_lab().status)
    return {"ok": True, **out, "job": _job["running"], "last_job": _job["last"]}


async def _run(name: str, fn) -> None:
    _job["running"] = name
    try:
        _job["last"] = {"name": name, **(await asyncio.to_thread(fn))}
    except Exception as exc:
        _job["last"] = {"name": name, "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
    finally:
        _job["running"] = None


@router.post("/up")
async def up() -> dict:
    if _job["running"]:
        return {"ok": False, "error": f"Busy: {_job['running']}"}
    asyncio.get_running_loop().create_task(_run("starting the lab", _lab().up))
    return {"ok": True, "started": True}


@router.post("/down")
async def down() -> dict:
    return {"ok": True, **(await asyncio.to_thread(_lab().down))}


class ServiceOp(BaseModel):
    op: str = Field(pattern="^(stop|start|restart|rebuild|scale)$")
    name: str
    n: int | None = Field(default=None, ge=1, le=5)


@router.post("/service")
async def service(body: ServiceOp) -> dict:
    if body.op == "rebuild":
        if _job["running"]:
            return {"ok": False, "error": f"Busy: {_job['running']}"}
        asyncio.get_running_loop().create_task(_run(f"rebuilding {body.name}", lambda: _lab().service("rebuild", body.name)))
        return {"ok": True, "started": True}
    out = await asyncio.to_thread(_lab().service, body.op, body.name, body.n)
    return {"ok": out["ok"], "detail": out["detail"], **({} if out["ok"] else {"error": out["detail"] or "that did not work"})}


@router.post("/knobs/{service}")
async def knobs(service: str, values: dict) -> dict:
    """Turn one of a service's knobs (the gateway refuses names it does not know)."""
    code, body = await asyncio.to_thread(lab_mod.call_gateway, "POST", f"/admin/knobs/{service}", values)
    if code != 200:
        return {"ok": False, "error": (body or {}).get("detail", "the lab is not answering") if isinstance(body, dict) else str(body)}
    return {"ok": True, **body}


@router.get("/snapshot")
async def snapshot() -> dict:
    return {"ok": True, **(await asyncio.to_thread(_lab().snapshot))}


@router.get("/logs")
async def logs(service: str = "", request_id: str = "", tail: int = 300) -> dict:
    items = await asyncio.to_thread(_lab().logs, service or None, request_id or None, tail)
    return {"ok": True, "items": items}


@router.get("/incidents")
def incidents() -> dict:
    return {"ok": True, "items": services.get_store().list_lab_incidents()}


@router.get("/missions")
def missions() -> dict:
    return {"ok": True, "items": _lab().missions()}


@router.get("/missions/{mission_id}")
def mission(mission_id: str) -> dict:
    m = _lab().mission(mission_id)
    return {"ok": True, "mission": m} if m else {"ok": False, "error": "No such mission"}


class CheckIn(BaseModel):
    answer: str = Field(default="", max_length=40)


@router.post("/missions/{mission_id}/check")
async def check(mission_id: str, body: CheckIn) -> dict:
    out = await asyncio.to_thread(_lab().check, mission_id, body.answer)
    return {"ok": True, "passed": out["ok"], "detail": out["detail"]}


@router.post("/missions/{mission_id}/{action}")
async def act(mission_id: str, action: str) -> dict:
    out = await asyncio.to_thread(_lab().act, mission_id, action)
    return {"ok": out["ok"], "detail": out["detail"], **({} if out["ok"] else {"error": out["detail"]})}
