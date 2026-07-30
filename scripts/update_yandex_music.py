#!/usr/bin/env python3
from __future__ import annotations

import difflib
import json
import math
import re
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yandex_music import Client

ROOT = Path(__file__).resolve().parents[1]
STAGE_VENUES = {
    "Сцена «Круг Света»",
    "Сцена «Берег»",
    "Сцена «Былина»",
}
SKIP_PARTS = ("победитель конкурса", "будет объявлен")
GENERIC_WORDS = {
    "official", "официальный", "официальная", "группа", "band", "music",
    "музыкальная", "проект", "the",
}


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
    if not events:
        raise RuntimeError("Schedule events were not found")
    return events


def load_aliases() -> dict[str, Any]:
    path = ROOT / "ym-artists-map.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def normalize(value: str) -> str:
    value = value.casefold().replace("ё", "е").replace("&", " и ")
    words = re.findall(r"[a-zа-я0-9]+", value)
    return " ".join(word for word in words if word not in GENERIC_WORDS)


def search_url(query: str) -> str:
    return "https://music.yandex.ru/search?text=" + urllib.parse.quote(query)


def query_config(title: str, aliases: dict[str, Any]) -> tuple[str, str | None, bool]:
    value = aliases.get(title)
    if isinstance(value, str):
        return value, None, False
    if isinstance(value, dict):
        query = str(value.get("query") or title).strip()
        artist_id = value.get("artist_id")
        return query, str(artist_id) if artist_id not in (None, "") else None, bool(value.get("force"))
    return title, None, False


def score_candidate(title: str, query: str, artist: Any) -> float:
    target = normalize(query or title)
    candidate = normalize(str(getattr(artist, "name", "") or ""))
    if not target or not candidate:
        return 0.0
    if target == candidate:
        return 1.0
    ratio = difflib.SequenceMatcher(None, target, candidate).ratio()
    target_words = set(target.split())
    candidate_words = set(candidate.split())
    overlap = len(target_words & candidate_words) / max(1, len(target_words | candidate_words))
    score = ratio * 0.72 + overlap * 0.28
    if target in candidate or candidate in target:
        score = max(score, 0.91)
    counts = getattr(artist, "counts", None)
    tracks = int(getattr(counts, "tracks", 0) or 0) if counts else 0
    if tracks >= 3:
        score += 0.012
    return min(score, 1.0)


def accept_direct(query: str, score: float, forced: bool) -> bool:
    if forced:
        return score >= 0.75
    normalized = normalize(query)
    words = normalized.split()
    # Однословные названия слишком неоднозначны: для них оставляем безопасную ссылку на поиск,
    # если соответствие не задано вручную через force/artist_id.
    if len(words) == 1:
        return False
    return score >= 0.89


def artist_cover(artist: Any) -> str:
    cover = getattr(artist, "cover", None)
    uri = str(getattr(cover, "uri", "") or "") if cover else ""
    if not uri:
        uri = str(getattr(artist, "og_image", "") or "")
    if not uri:
        return ""
    uri = uri.replace("%%", "400x400")
    if uri.startswith("//"):
        return "https:" + uri
    if uri.startswith("http://") or uri.startswith("https://"):
        return uri
    return "https://" + uri.lstrip("/")


def direct_profile(title: str, artist: Any, score: float) -> dict[str, Any]:
    artist_id = getattr(artist, "id", None)
    name = str(getattr(artist, "name", "") or title)
    return {
        "name": name,
        "url": f"https://music.yandex.ru/artist/{artist_id}",
        "kind": "artist",
        "artist_id": str(artist_id),
        "cover": artist_cover(artist),
        "match_score": round(score, 3),
        "source": "yandex-music-api",
    }


def fallback_profile(title: str, query: str) -> dict[str, Any]:
    return {
        "name": title,
        "url": search_url(query),
        "kind": "search",
        "query": query,
        "match_score": 0,
        "source": "search-fallback",
    }


def candidate_report(artist: Any, score: float) -> dict[str, Any]:
    artist_id = getattr(artist, "id", None)
    return {
        "id": artist_id,
        "name": str(getattr(artist, "name", "") or ""),
        "url": f"https://music.yandex.ru/artist/{artist_id}" if artist_id is not None else "",
        "score": round(score, 3),
    }


def main() -> None:
    events = load_events()
    aliases = load_aliases()
    titles = sorted({
        str(event.get("title", "")).strip()
        for event in events
        if event.get("venue") in STAGE_VENUES
        and str(event.get("title", "")).strip()
        and not any(part in str(event.get("title", "")).casefold() for part in SKIP_PARTS)
    }, key=str.casefold)

    client = Client().init()
    profiles: dict[str, Any] = {}
    report: dict[str, Any] = {"searched": len(titles), "items": {}}
    direct_count = 0

    for index, title in enumerate(titles, 1):
        query, forced_id, forced = query_config(title, aliases)
        print(f"[{index}/{len(titles)}] {title} -> {query}")

        if forced_id:
            profiles[title] = {
                "name": title,
                "url": f"https://music.yandex.ru/artist/{forced_id}",
                "kind": "artist",
                "artist_id": forced_id,
                "match_score": 1,
                "source": "manual-id",
            }
            direct_count += 1
            report["items"][title] = {"selected": profiles[title], "candidates": []}
            continue

        candidates: list[tuple[float, Any]] = []
        try:
            result = client.search(query, type_="artist", page=0)
            artists_result = getattr(result, "artists", None) if result else None
            artists = list(getattr(artists_result, "results", []) or [])
            candidates = sorted(
                ((score_candidate(title, query, artist), artist) for artist in artists),
                key=lambda item: (
                    item[0],
                    math.log1p(int(getattr(getattr(item[1], "counts", None), "tracks", 0) or 0)),
                ),
                reverse=True,
            )
        except Exception as exc:
            print(f"  search failed: {type(exc).__name__}: {exc}")

        selected = fallback_profile(title, query)
        if candidates:
            best_score, best_artist = candidates[0]
            if getattr(best_artist, "id", None) is not None and accept_direct(query, best_score, forced):
                selected = direct_profile(title, best_artist, best_score)
                direct_count += 1
                print(f"  direct: {selected['name']} ({best_score:.3f})")
            else:
                print(f"  fallback search; best={getattr(best_artist, 'name', '')} ({best_score:.3f})")
        else:
            print("  fallback search; no candidates")

        profiles[title] = selected
        report["items"][title] = {
            "selected": selected,
            "candidates": [candidate_report(artist, score) for score, artist in candidates[:5]],
        }
        time.sleep(0.16)

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = {
        "profiles": profiles,
        "meta": {
            "generated_at": generated_at,
            "total": len(profiles),
            "direct": direct_count,
            "fallback": len(profiles) - direct_count,
            "library": "MarshalX/yandex-music-api",
        },
    }
    report["generated_at"] = generated_at
    report["direct"] = direct_count
    report["fallback"] = len(profiles) - direct_count

    (ROOT / "ff2026-yandex.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (ROOT / "ym-search-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Done: {direct_count} direct artist links, {len(profiles) - direct_count} search fallbacks")


if __name__ == "__main__":
    main()
