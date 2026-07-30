#!/usr/bin/env python3
"""Build the static VK profile database for the Fantasy Fest schedule.

The script never searches VK by performer name. Verified screen names/group IDs are
stored in vk-groups-map.json, while curated descriptions are stored in
vk-manual-profiles.json. If VKKEY is accepted by VK, groups.getById enriches the
manual records with current photos, descriptions and subscriber counts. If the
key is missing or rejected, the curated database is still published unchanged.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_VERSION = os.environ.get("VK_API_VERSION", "5.199")
TOKEN = os.environ.get("VK_TOKEN", "").strip()
STAGE_VENUES = {
    "Сцена «Круг Света»",
    "Сцена «Берег»",
    "Сцена «Былина»",
}
SKIP_PARTS = ("победитель конкурса", "будет объявлен")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"WARN: cannot read {path.name}: {exc}")
        return default


def load_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    pattern = re.compile(r"\.concat\((\[.*\])\);?\s*$", re.S)
    for path in sorted(ROOT.glob("ff2026-data-*.js")):
        match = pattern.search(path.read_text(encoding="utf-8"))
        if not match:
            continue
        chunk = json.loads(match.group(1))
        if isinstance(chunk, list):
            events.extend(item for item in chunk if isinstance(item, dict))
    return events


def load_map() -> dict[str, str | int]:
    raw = read_json(ROOT / "vk-groups-map.json", {})
    if not isinstance(raw, dict):
        return {}
    result: dict[str, str | int] = {}
    for title, identifier in raw.items():
        if str(title).startswith("_") or identifier in (None, ""):
            continue
        if isinstance(identifier, (str, int)):
            result[str(title)] = identifier
        elif isinstance(identifier, dict):
            value = identifier.get("screen_name") or identifier.get("group_id") or identifier.get("id")
            if isinstance(value, (str, int)) and value != "":
                result[str(title)] = value
    return result


def load_manual_profiles() -> dict[str, dict[str, Any]]:
    raw = read_json(ROOT / "vk-manual-profiles.json", {})
    if not isinstance(raw, dict):
        return {}
    profiles: dict[str, dict[str, Any]] = {}
    for title, profile in raw.items():
        if isinstance(profile, dict):
            profiles[str(title)] = dict(profile)
    return profiles


def canonical_identifier(value: str | int) -> str:
    text = str(value).strip()
    if text.startswith("https://vk.com/") or text.startswith("https://vk.ru/"):
        text = text.rstrip("/").rsplit("/", 1)[-1]
    if text.startswith("club") and text[4:].isdigit():
        return text[4:]
    if text.startswith("public") and text[6:].isdigit():
        return text[6:]
    return text


def vk_call_groups(identifiers: list[str]) -> tuple[list[dict[str, Any]], str | None]:
    if not TOKEN or not identifiers:
        return [], None
    body = urllib.parse.urlencode({
        "group_ids": ",".join(identifiers),
        "fields": "description,status,site,members_count,photo_200,photo_400_orig,screen_name,verified,activity",
        "access_token": TOKEN,
        "v": API_VERSION,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.vk.com/method/groups.getById",
        data=body,
        headers={"User-Agent": "FantasyFestSchedule/2.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return [], f"transport error: {type(exc).__name__}: {exc}"

    if "error" in payload:
        error = payload["error"]
        return [], f"VK API [{error.get('error_code', '?')}] {error.get('error_msg', 'unknown error')}"

    response = payload.get("response")
    if isinstance(response, list):
        return [item for item in response if isinstance(item, dict)], None
    if isinstance(response, dict):
        groups = response.get("groups") or response.get("items") or []
        if isinstance(groups, list):
            return [item for item in groups if isinstance(item, dict)], None
    return [], "VK API returned an unsupported response format"


def group_keys(group: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    if group.get("id") is not None:
        keys.add(str(group["id"]))
        keys.add(f"club{group['id']}")
        keys.add(f"public{group['id']}")
    if group.get("screen_name"):
        keys.add(str(group["screen_name"]).casefold())
    return keys


def enrich(profile: dict[str, Any], group: dict[str, Any]) -> dict[str, Any]:
    result = dict(profile)
    if group.get("name"):
        result["name"] = str(group["name"]).strip()
    if group.get("description"):
        result["description"] = re.sub(r"\n{3,}", "\n\n", str(group["description"]).strip())[:1800]
    if group.get("status"):
        result["status"] = str(group["status"]).strip()[:500]
    if group.get("activity"):
        result["activity"] = str(group["activity"]).strip()
    photo = group.get("photo_400_orig") or group.get("photo_200")
    if photo:
        result["photo"] = photo
    if group.get("members_count") is not None:
        result["members_count"] = int(group.get("members_count") or 0)
    if group.get("verified") is not None:
        result["verified"] = bool(group.get("verified"))
    screen_name = group.get("screen_name") or group.get("id")
    if screen_name:
        result["url"] = f"https://vk.com/{screen_name}"
    result["source"] = "vk_api+manual"
    return result


def write_outputs(profiles: dict[str, dict[str, Any]], report: dict[str, Any]) -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta = {
        "generated_at": generated_at,
        "matched": len(profiles),
        "api_version": API_VERSION,
        "source": "verified_map",
    }
    js = (
        "window.FF_VK_PROFILES="
        + json.dumps(profiles, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        + ";\nwindow.FF_VK_META="
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.FF_VK_READY=Promise.resolve(window.FF_VK_PROFILES);\n"
    )
    (ROOT / "ff2026-vk.js").write_text(js, encoding="utf-8")
    report["generated_at"] = generated_at
    report["matched"] = len(profiles)
    (ROOT / "vk-search-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    events = load_events()
    mapping = load_map()
    profiles = load_manual_profiles()

    titles = sorted({
        str(event.get("title", "")).strip()
        for event in events
        if event.get("venue") in STAGE_VENUES
        and str(event.get("title", "")).strip()
        and not any(part in str(event.get("title", "")).casefold() for part in SKIP_PARTS)
    }, key=str.casefold)

    identifier_to_titles: dict[str, list[str]] = {}
    for title, identifier in mapping.items():
        key = canonical_identifier(identifier)
        identifier_to_titles.setdefault(key.casefold(), []).append(title)

    groups, api_error = vk_call_groups(list(identifier_to_titles))
    by_key: dict[str, dict[str, Any]] = {}
    for group in groups:
        for key in group_keys(group):
            by_key[key.casefold()] = group

    enriched = 0
    for identifier, mapped_titles in identifier_to_titles.items():
        group = by_key.get(identifier.casefold())
        if not group:
            continue
        for title in mapped_titles:
            profiles[title] = enrich(profiles.get(title, {"url": f"https://vk.com/{identifier}"}), group)
            enriched += 1

    unresolved = [title for title in titles if title not in profiles]
    report = {
        "searched": len(titles),
        "verified_mappings": len(mapping),
        "manual_profiles": len(load_manual_profiles()),
        "api_enriched": enriched,
        "api_error": api_error,
        "unresolved": unresolved,
        "note": "Only verified VK identifiers are used; name search is disabled.",
    }
    write_outputs(profiles, report)
    print(f"Done: {len(profiles)}/{len(titles)} profiles; API enriched: {enriched}")
    if api_error:
        print(f"WARN: {api_error}")


if __name__ == "__main__":
    main()
