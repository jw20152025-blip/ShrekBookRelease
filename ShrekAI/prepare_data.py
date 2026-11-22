from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path
from typing import Any

from datasets import load_dataset

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TRAIN_OUT = DATA_DIR / "train.jsonl"
VALID_OUT = DATA_DIR / "validation.jsonl"
MANIFEST = DATA_DIR / "manifest.json"
CUSTOM = DATA_DIR / "custom.jsonl"
SEED = 42


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.replace("\x00", " ").split()).strip()


def add_record(rows: list[dict[str, Any]], text: str, source: str) -> None:
    text = clean_text(text)
    if len(text) >= 80:
        rows.append({"text": text, "source": source, "language": "en"})


def main() -> None:
    print("[ShrekAI] Downloading English WikiText-103...")
    wiki = load_dataset(
        "Salesforce/wikitext",
        "wikitext-103-raw-v1",
    )

    train_rows: list[dict[str, Any]] = []
    valid_rows: list[dict[str, Any]] = []

    for split_name, destination in (
        ("train", train_rows),
        ("validation", valid_rows),
    ):
        if split_name not in wiki:
            continue
        for item in wiki[split_name]:
            add_record(destination, item.get("text", ""), "wikitext-103")

    print("[ShrekAI] Downloading OpenAssistant OASST1...")
    oasst = load_dataset("OpenAssistant/oasst1", split="train")
    by_id: dict[str, dict[str, Any]] = {}
    for row in oasst:
        message_id = row.get("message_id")
        if message_id:
            by_id[message_id] = row

    conversation_rows: list[dict[str, Any]] = []
    for row in oasst:
        if row.get("lang") != "en" or row.get("deleted", False):
            continue
        if row.get("role") != "assistant":
            continue
        parent = by_id.get(row.get("parent_id"))
        if not parent or parent.get("role") not in ("prompter", "user"):
            continue
        question = clean_text(parent.get("text", ""))
        answer = clean_text(row.get("text", ""))
        if len(question) < 5 or len(answer) < 10:
            continue
        conversation_rows.append({
            "messages": [
                {"role": "user", "content": question},
                {"role": "assistant", "content": answer},
            ],
            "source": "oasst1",
            "language": "en",
        })

    rng = random.Random(SEED)
    rng.shuffle(conversation_rows)
    cut = max(1, int(len(conversation_rows) * 0.98))
    train_rows.extend(conversation_rows[:cut])
    valid_rows.extend(conversation_rows[cut:])

    if CUSTOM.exists():
        print("[ShrekAI] Importing custom.jsonl...")
        with CUSTOM.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        f"Invalid JSON in custom.jsonl line {line_number}: {exc}"
                    ) from exc
                if isinstance(item.get("messages"), list):
                    train_rows.append({
                        "messages": item["messages"],
                        "source": "custom",
                        "language": "en",
                    })
                elif isinstance(item.get("text"), str):
                    add_record(train_rows, item["text"], "custom")

    rng.shuffle(train_rows)
    rng.shuffle(valid_rows)
    write_jsonl(TRAIN_OUT, train_rows)
    write_jsonl(VALID_OUT, valid_rows)

    digest = hashlib.sha256()
    for path in (TRAIN_OUT, VALID_OUT):
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)

    manifest = {
        "base_model": "Qwen/Qwen3-0.6B",
        "tokenizer": "Qwen/Qwen3-0.6B",
        "tokenizer_is_fixed": True,
        "sources": {
            "wikitext": "Salesforce/wikitext:wikitext-103-raw-v1",
            "conversations": "OpenAssistant/oasst1 (lang=en)",
            "custom": "data/custom.jsonl if present",
        },
        "train_records": len(train_rows),
        "validation_records": len(valid_rows),
        "dataset_sha256": digest.hexdigest(),
        "note": "English-filtered dataset; this does not guarantee complete English mastery.",
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[ShrekAI] Training records: {len(train_rows):,}")
    print(f"[ShrekAI] Validation records: {len(valid_rows):,}")
    print(f"[ShrekAI] Dataset SHA-256: {manifest['dataset_sha256']}")
    print("[ShrekAI] Dataset import complete.")


if __name__ == "__main__":
    main()
