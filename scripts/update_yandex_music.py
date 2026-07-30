#!/usr/bin/env python3
from __future__ import annotations

import difflib
import json
import math
import re
import time
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


def load_map() -> dict[str, Any]:
    path = ROOT / "ym-artists-map.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def normalize(value: str) -> str:
    value = value.casefold().replace("ё", "е").replace("&", " и ")
    words = re.findall(r"[a-zа-я0-9]+", value)
    return " ".join(word for word in words if word not in GENERIC_WORDS)


def query_config(title: str, mapping: dict[str, Any]) -> tuple[str, str | None, bool]:
    value = mapping.get(title)
    if isinstance(value, str):
        return value.strip() or title, None, False
    if isinstance(value, dict):
        query = str(value.get("query") or title).strip()
        artist_id = value.get("artist_id")
        forced_id = str(artist_id).strip() if artist_id not in (None, "") else None
        return query, forced_id, bool(value.get("force"))
    return title, None, False


def artist_catalog_size(artist: Any) -> tuple[int, int]:
    counts = getattr(artist, "counts", None)
    tracks = int(getattr(counts, "tracks", 0) or 0) if counts else 0
    albums = int(getattr(counts, "direct_albums", 0) or getattr(counts, "albums", 0) or 0) if counts else 0
    return tracks, albums


def score_candidate(query: str, artist: Any) -> float:
    target = normalize(query)
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
    tracks, _ = artist_catalog_size(artist)
    if tracks >= 3:
        score += 0.01
    return min(score, 1.0)


def accept_direct(query: str, artist: Any, score: float, forced: bool) -> bool:
    target = normalize(query)
    candidate = normalize(str(getattr(artist, "name", "") or ""))
    if not target or not candidate or getattr(artist, "id", None) is None:
        return False
    tracks, albums = artist_catalog_size(artist)
    has_catalog = tracks > 0 or albums > 0
    if forced:
        return score >= 0.75 and has_catalog
    # Однословные имена слишком неоднозначны. Для них прямая ссылка появляется
    # только после ручного подтверждения artist_id/force в ym-artists-map.json.
    if len(target.split()) == 1:
        return False
    # Автоматически принимаем лишь точное имя с реальным каталогом.
    return target == candidate and has_catalog


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


def direct_profile(title: str, artist: Any, score: float, source: str) -> dict[str, Any]:
    artist_id = getattr(artist, "id", None)
    tracks, albums = artist_catalog_size(artist)
    return {
        "name": str(getattr(artist, "name", "") or title),
        "url": f"https://music.yandex.ru/artist/{artist_id}",
        "kind": "artist",
        "artist_id": str(artist_id),
        "cover": artist_cover(artist),
        "tracks": tracks,
        "albums": albums,
        "match_score": round(score, 3),
        "source": source,
    }


def candidate_report(artist: Any, score: float) -> dict[str, Any]:
    artist_id = getattr(artist, "id", None)
    tracks, albums = artist_catalog_size(artist)
    return {
        "id": artist_id,
        "name": str(getattr(artist, "name", "") or ""),
        "url": f"https://music.yandex.ru/artist/{artist_id}" if artist_id is not None else "",
        "score": round(score, 3),
        "tracks": tracks,
        "albums": albums,
    }


def main() -> None:
    events = load_events()
    mapping = load_map()
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
    search_failures = 0

    for index, title in enumerate(titles, 1):
        query, forced_id, forced = query_config(title, mapping)
        print(f"[{index}/{len(titles)}] {title} -> {query}")

        if forced_id:
            profiles[title] = {
                "name": title,
                "url": f"https://music.yandex.ru/artist/{forced_id}",
                "kind": "artist",
                "artist_id": forced_id,
                "cover": "",
                "tracks": 0,
                "albums": 0,
                "match_score": 1,
                "source": "manual-id",
            }
            report["items"][title] = {"selected": profiles[title], "candidates": []}
            continue

        candidates: list[tuple[float, Any]] = []
        error = ""
        try:
            result = client.search(query, type_="artist", page=0)
            artists_result = getattr(result, "artists", None) if result else None
            artists = list(getattr(artists_result, "results", []) or [])
            candidates = sorted(
                ((score_candidate(query, artist), artist) for artist in artists),
                key=lambda item: (
                    item[0],
                    math.log1p(artist_catalog_size(item[1])[0]),
                ),
                reverse=True,
            )
        except Exception as exc:
            search_failures += 1
            error = f"{type(exc).__name__}: {exc}"
            print(f"  search failed: {error}")

        selected: dict[str, Any] | None = None
        if candidates:
            best_score, best_artist = candidates[0]
            if accept_direct(query, best_artist, best_score, forced):
                selected = direct_profile(title, best_artist, best_score, "forced-query" if forced else "exact-name")
                profiles[title] = selected
                print(f"  direct: {selected['name']} ({best_score:.3f})")
            else:
                print(f"  omitted; best={getattr(best_artist, 'name', '')} ({best_score:.3f})")
        else:
            print("  omitted; no candidates")

        report["items"][title] = {
            "query": query,
            "selected": selected,
            "error": error,
            "candidates": [candidate_report(artist, score) for score, artist in candidates[:5]],
        }
        time.sleep(0.18)

    if search_failures == len(titles):
        raise RuntimeError("Every Yandex Music search request failed; generated files were not replaced")

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = {
        "profiles": profiles,
        "meta": {
            "generated_at": generated_at,
            "total_artists": len(titles),
            "available": len(profiles),
            "unavailable": len(titles) - len(profiles),
            "library": "MarshalX/yandex-music-api",
            "policy": "exact-artist-pages-only",
        },
    }
    report["generated_at"] = generated_at
    report["available"] = len(profiles)
    report["unavailable"] = len(titles) - len(profiles)

    (ROOT / "ff2026-yandex.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (ROOT / "ym-search-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Done: {len(profiles)} exact artist pages; {len(titles) - len(profiles)} omitted")


if __name__ == "__main__":
    main()
