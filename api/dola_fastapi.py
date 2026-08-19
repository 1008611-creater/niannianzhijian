from __future__ import annotations

import base64
import hashlib
import hmac
import os
import tempfile
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

BRIDGE_URL = os.getenv("DOLA_BRIDGE_URL", "http://127.0.0.1:9190").rstrip("/")
API_KEY = os.getenv("DOLA_FASTAPI_KEY", "change-me")
SUPPORTED_RATIOS = {"9:16", "16:9", "1:1", "4:3", "3:4"}
LIMITS = {"image": 30, "video": 10, "audio": 10}
app = FastAPI(title="NianNian Dola API", version="1.0.0")


def auth(value: str | None) -> None:
    if not value or not hmac.compare_digest(value, API_KEY):
        raise HTTPException(401, "Invalid API key")


@app.get("/healthz")
async def healthz() -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            response = await client.get(f"{BRIDGE_URL}/api/v1/capabilities")
            return {"status": "ok", "bridge": response.json()}
        except (httpx.HTTPError, ValueError):
            return {"status": "degraded", "bridge": {"ready": False}}


async def encode_uploads(kind: str, uploads: list[UploadFile] | None) -> list[dict]:
    result = []
    for upload in uploads or []:
        if len(result) >= LIMITS[kind]:
            raise HTTPException(422, f"too many {kind} files")
        data = await upload.read()
        if not data:
            raise HTTPException(422, f"empty {kind} file")
        result.append({"kind": f"reference_{kind}", "originalName": upload.filename or f"{kind}.bin", "dataBase64": base64.b64encode(data).decode("ascii"), "sha256": hashlib.sha256(data).hexdigest()})
    return result


@app.post("/v1/jobs", status_code=202)
async def create_job(
    prompt: Annotated[str, Form(min_length=1, max_length=12000)],
    submit: Annotated[bool, Form()] = True,
    aspect_ratio: Annotated[str, Form()] = "16:9",
    image: Annotated[list[UploadFile] | None, File()] = None,
    video: Annotated[list[UploadFile] | None, File()] = None,
    audio: Annotated[list[UploadFile] | None, File()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
    x_generation_authorization: Annotated[str | None, Header()] = None,
    idempotency_key: Annotated[str | None, Header()] = None,
) -> dict:
    auth(x_api_key)
    if not submit or x_generation_authorization != "submit":
        raise HTTPException(403, "真实生成需要 X-Generation-Authorization: submit")
    if aspect_ratio not in SUPPORTED_RATIOS:
        raise HTTPException(422, "unsupported aspect_ratio")
    assets = await encode_uploads("image", image) + await encode_uploads("video", video) + await encode_uploads("audio", audio)
    payload = {"prompt": prompt, "aspectRatio": aspect_ratio, "durationSeconds": 30, "assets": assets, "confirmProviderSpend": True, "idempotencyKey": idempotency_key or str(uuid4())}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{BRIDGE_URL}/v1/jobs", json=payload)
    if response.status_code >= 400:
        try: detail = response.json()
        except ValueError: detail = {"error": "Dola bridge rejected request"}
        raise HTTPException(response.status_code, detail)
    job_id = response.json()["job_id"]
    return {"job_id": job_id, "status": "queued", "status_url": f"/v1/jobs/{job_id}"}


@app.get("/v1/jobs/{job_id}")
async def get_job(job_id: str, x_api_key: Annotated[str | None, Header()] = None) -> dict:
    auth(x_api_key)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{BRIDGE_URL}/v1/jobs/{job_id}")
    if response.status_code >= 400:
        raise HTTPException(response.status_code, response.json())
    body = response.json()
    if body.get("status") == "succeeded" and body.get("output_url"):
        body["output_url"] = f"/v1/jobs/{job_id}/download"
    return body


@app.get("/v1/jobs/{job_id}/download")
async def download_job(job_id: str, x_api_key: Annotated[str | None, Header()] = None):
    auth(x_api_key)
    from fastapi.responses import StreamingResponse
    async def stream():
        async with httpx.AsyncClient(timeout=None) as client:
            status = await client.get(f"{BRIDGE_URL}/v1/jobs/{job_id}")
            if status.status_code >= 400 or not status.json().get("output_url"):
                return
            async with client.stream("GET", status.json()["output_url"]) as response:
                if response.status_code >= 400:
                    return
                async for chunk in response.aiter_bytes():
                    yield chunk
    return StreamingResponse(stream(), media_type="video/mp4", headers={"content-disposition": f'attachment; filename="{job_id}.mp4"'})
