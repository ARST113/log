#!/usr/bin/env python3
"""Build a static VK community database for the Fantasy Fest schedule.

The access token is read only from VK_TOKEN (GitHub Actions secret VKKEY).
No token is ever written to generated files or logs.
"""
from __future__ import annotations

import difflib
import json
import math
import os
import re
import sys
import time
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
SKIP_PARTS = (
    "победитель конкурса",
    "будет объявлен",
)
MUSIC_HINTS = (
    "music", "musician", "band", "artist", "музык", "музыкан", "группа",
    "рок", "rock", "folk", "фолк", "metal", "метал", "concert", "концерт",
    "singer", "вокал", "исполнител", "оркестр", "ensemble", "ансамбль",
)
GENERIC_WORDS = {
    "official", "официальная", "официальный", "группа", "band", "music",
    "музыкальная", "проект", "the",
}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    pattern = re.compile(r"\.concat\((\[.*\])\);?\s*$", re.S)
    for path in sorted(ROOT.glob("ff2026-data-*.js")):
        text = path.read_text(encoding="utf-8")
        match = pattern.search(text)
        if not match:
            print(f"WARN: could not parse {path.name}", file=sys.stderr)
            continue
        chunk = json.loads(match.group(1))
        if isinstance(chunk, list):
            events.extend(item for item in chunk if isinstance(item, dict))
    if not events:
        fail("schedule events were not found")
    return events


def load_overrides() -> dict[str, Any]:
    path = ROOT / "vk-groups-map.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def normalize(value: str) -> str:
    value = value.casefold().replace("ё", "е").replace("&", " и ")
    words = re.findall(r"[a-zа-я0-9]+", value)
    words = [word for word in words if word not in GENERIC_WORDS]
    return " ".join(words)


def query_variants(title: str) -> list[str]:
    variants = [title.strip()]
    without_parens = re.sub(r"\s*\([^)]*\)\s*", " ", title).strip()
    if without_parens and without_parens not in variants:
        variants.append(without_parens)
    if " и " in title.casefold():
        first = re.split(r"\s+[и&]\s+", title, maxsplit=1, flags=re.I)[0].strip()
        if len(first) >= 4 and first not in variants:
            variants.append(first)
    return variants[:3]


_last_request = 0.0


def vk_call(method: str, params: dict[str, Any]) -> Any:
    global _last_request
    delay = 0.38 - (time.monotonic() - _last_request)
    if delay > 0:
        time.sleep(delay)
    body = urllib.parse.urlencode({
        **params,
        "access_token": TOKEN,
        "v": API_VERSION,
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
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"VK request failed for {method}: {exc}") from exc
    finally:
        _last_request = time.monotonic()
    if "error" in payload:
        error = payload["error"]
        code = error.get("error_code", "?")
        message = error.get("error_msg", "unknown VK error")
        raise RuntimeError(f"VK API {method}: [{code}] {message}")
    return payload.get("response")


def response_groups(response: Any) -> list[dict[str, Any]]:
    if isinstance(response, list):
        return [item for item in response if isinstance(item, dict)]
    if isinstance(response, dict):
        for key in ("groups", "items"):
            value = response.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def get_groups(identifiers: list[str | int]) -> list[dict[str, Any]]:
    if not identifiers:
        return []
    response = vk_call("groups.getById", {
        "group_ids": ",".join(str(item) for item in identifiers),
        "fields": "description,status,site,members_count,photo_200,photo_400_orig,screen_name,verified,activity",
    })
    return response_groups(response)


def search_groups(query: str) -> list[dict[str, Any]]:
    response = vk_call("groups.search", {"q": query, "count": 10})
    basic = response_groups(response)
    ids = [item.get("id") for item in basic if item.get("id")]
    details = get_groups(ids)
    if not details:
        return basic
    by_id = {item.get("id"): item for item in details}
    return [{**item, **by_id.get(item.get("id"), {})} for item in basic]


def music_relevance(group: dict[str, Any]) -> bool:
    haystack = " ".join(str(group.get(key, "")) for key in ("name", "activity", "description", "status")).casefold()
    return any(hint in haystack for hint in MUSIC_HINTS)


def score_candidate(title: str, group: dict[str, Any]) -> float:
    target = normalize(title)
    candidate = normalize(str(group.get("name", "")))
    if not target or not candidate:
        return 0.0
    ratio = difflib.SequenceMatcher(None, target, candidate).ratio()
    target_words, candidate_words = set(target.split()), set(candidate.split())
    overlap = len(target_words & candidate_words) / max(1, len(target_words | candidate_words))
    score = ratio * 0.72 + overlap * 0.28
    if target == candidate:
        score = 1.0
    elif target in candidate or candidate in target:
        score = max(score, 0.88)
    if music_relevance(group):
        score += 0.055
    if group.get("verified"):
        score += 0.025
    return min(score, 1.0)


def acceptance_threshold(title: str, group: dict[str, Any], score: float) -> bool:
    norm = normalize(title)
    candidate = normalize(str(group.get("name", "")))
    word_count = len(norm.split())
    generic_short = word_count == 1 and len(norm) <= 12
    if norm == candidate:
        return music_relevance(group) if generic_short else True
    if generic_short:
        return score >= 0.96 and music_relevance(group)
    return score >= 0.90


def profile_from_group(group: dict[str, Any], score: float, source: str) -> dict[str, Any]:
    screen_name = str(group.get("screen_name") or group.get("id") or "")
    description = re.sub(r"\n{3,}", "\n\n", str(group.get("description") or "").strip())
    status = str(group.get("status") or "").strip()
    photo = group.get("photo_400_orig") or group.get("photo_200") or ""
    return {
        "name": str(group.get("name") or "").strip(),
        "description": description[:1800],
        "status": status[:500],
        "activity": str(group.get("activity") or "").strip(),
        "photo": photo,
        "url": f"https://vk.com/{screen_name}" if screen_name else "",
        "members_count": int(group.get("members_count") or 0),
        "verified": bool(group.get("verified")),
        "match_score": round(score, 3),
        "source": source,
    }


def resolve_override(title: str, override: Any) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    identifier: str | int | None = None
    if isinstance(override, (str, int)):
        identifier = override
    elif isinstance(override, dict):
        identifier = override.get("screen_name") or override.get("group_id") or override.get("id")
    if identifier in (None, ""):
        return None, []
    groups = get_groups([identifier])
    if not groups:
        return None, []
    group = groups[0]
    return profile_from_group(group, 1.0, "override"), [group]


def resolve_title(title: str, override: Any) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    if override not in (None, "", {}):
        return resolve_override(title, override)

    merged: dict[Any, dict[str, Any]] = {}
    for query in query_variants(title):
        try:
            for group in search_groups(query):
                key = group.get("id") or group.get("screen_name") or group.get("name")
                if key is not None:
                    merged[key] = {**merged.get(key, {}), **group}
        except RuntimeError as exc:
            print(f"WARN: {title!r}, query {query!r}: {exc}", file=sys.stderr)

    ranked = sorted(
        ((score_candidate(title, group), group) for group in merged.values()),
        key=lambda item: (item[0], math.log1p(int(item[1].get("members_count") or 0))),
        reverse=True,
    )
    candidates = [group | {"_score": round(score, 3)} for score, group in ranked[:5]]
    if not ranked:
        return None, candidates
    score, best = ranked[0]
    if acceptance_threshold(title, best, score):
        return profile_from_group(best, score, "search"), candidates
    return None, candidates


def candidate_for_report(group: dict[str, Any]) -> dict[str, Any]:
    screen_name = str(group.get("screen_name") or group.get("id") or "")
    return {
        "id": group.get("id"),
        "name": group.get("name", ""),
        "url": f"https://vk.com/{screen_name}" if screen_name else "",
        "activity": group.get("activity", ""),
        "members_count": group.get("members_count", 0),
        "score": group.get("_score", 0),
    }


def write_outputs(profiles: dict[str, Any], report: dict[str, Any]) -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    js = (
        "window.FF_VK_PROFILES="
        + json.dumps(profiles, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        + ";\nwindow.FF_VK_META="
        + json.dumps({
            "generated_at": generated_at,
            "matched": len(profiles),
            "searched": report["searched"],
            "api_version": API_VERSION,
        }, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    (ROOT / "ff2026-vk.js").write_text(js, encoding="utf-8")
    report["generated_at"] = generated_at
    report["matched"] = len(profiles)
    (ROOT / "vk-search-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if not TOKEN:
        fail("GitHub secret VKKEY is unavailable (VK_TOKEN is empty)")
    events = load_events()
    overrides = load_overrides()
    titles = sorted({
        str(event.get("title", "")).strip()
        for event in events
        if event.get("venue") in STAGE_VENUES
        and str(event.get("title", "")).strip()
        and not any(part in str(event.get("title", "")).casefold() for part in SKIP_PARTS)
    }, key=str.casefold)

    profiles: dict[str, Any] = {}
    unresolved: dict[str, Any] = {}
    for index, title in enumerate(titles, 1):
        print(f"[{index}/{len(titles)}] {title}")
        profile, candidates = resolve_title(title, overrides.get(title))
        if profile:
            profiles[title] = profile
            print(f"  matched: {profile['name']} ({profile['match_score']})")
        else:
            unresolved[title] = [candidate_for_report(item) for item in candidates]
            print("  unresolved")

    report = {
        "searched": len(titles),
        "unresolved": unresolved,
        "note": "Add exact screen_name/group_id values to vk-groups-map.json for ambiguous titles.",
    }
    write_outputs(profiles, report)
    print(f"Done: {len(profiles)}/{len(titles)} profiles matched")


if __name__ == "__main__":
    main()
