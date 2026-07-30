#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
token = os.environ.get("VK_TOKEN", "").strip()
version = os.environ.get("VK_API_VERSION", "5.199")


def call(method: str, params: dict[str, object]) -> dict[str, object]:
    body = urllib.parse.urlencode({
        **params,
        "access_token": token,
        "v": version,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.vk.com/method/{method}",
        data=body,
        headers={"User-Agent": "FantasyFestSchedule/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except Exception as exc:
        return {
            "ok": False,
            "transport_error": type(exc).__name__,
            "message": str(exc),
        }

    if "error" in payload:
        error = payload["error"]
        return {
            "ok": False,
            "error_code": error.get("error_code"),
            "error_msg": error.get("error_msg"),
            "request_parameter_names": [
                item.get("key") for item in error.get("request_params", [])
                if item.get("key") != "access_token"
            ],
        }

    response = payload.get("response")
    result: dict[str, object] = {
        "ok": True,
        "response_type": type(response).__name__,
    }
    if isinstance(response, dict):
        result["response_keys"] = sorted(response.keys())
        items = response.get("items") or response.get("groups") or []
    elif isinstance(response, list):
        items = response
    else:
        items = []
    result["items_count"] = len(items) if isinstance(items, list) else 0
    return result


result: dict[str, object] = {
    "api_version": version,
    "token_present": bool(token),
}

if token:
    result["methods"] = {
        "users.get": call("users.get", {"user_ids": 1}),
        "groups.getById": call("groups.getById", {"group_id": 1}),
        "groups.search": call("groups.search", {"q": "Эпидемия", "count": 3}),
    }
    result["token_valid"] = any(
        method_result.get("ok") is True
        for method_result in result["methods"].values()
        if isinstance(method_result, dict)
    )
else:
    result["token_valid"] = False

(ROOT / "vk-api-status.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
