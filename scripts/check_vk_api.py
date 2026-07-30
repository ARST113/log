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

result = {"api_version": version, "token_present": bool(token)}
if token:
    body = urllib.parse.urlencode({
        "q": "Эпидемия",
        "count": 3,
        "access_token": token,
        "v": version,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.vk.com/method/groups.search",
        data=body,
        headers={"User-Agent": "FantasyFestSchedule/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        if "error" in payload:
            error = payload["error"]
            result["ok"] = False
            result["error_code"] = error.get("error_code")
            result["error_msg"] = error.get("error_msg")
            result["request_parameter_names"] = [
                item.get("key") for item in error.get("request_params", [])
                if item.get("key") != "access_token"
            ]
        else:
            response = payload.get("response")
            result["ok"] = True
            result["response_type"] = type(response).__name__
            if isinstance(response, dict):
                result["response_keys"] = sorted(response.keys())
                items = response.get("items") or response.get("groups") or []
            elif isinstance(response, list):
                items = response
            else:
                items = []
            result["items_count"] = len(items) if isinstance(items, list) else 0
            result["sample"] = [
                {"id": item.get("id"), "name": item.get("name")}
                for item in items[:3] if isinstance(item, dict)
            ]
    except Exception as exc:
        result.update({"ok": False, "transport_error": type(exc).__name__, "message": str(exc)})

(ROOT / "vk-api-status.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
