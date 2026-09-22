import json
from pathlib import Path


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

INPUT = BASE_DIR / "ShrekAI" / "web_model" / "tokenizer.json"
OUTPUT = BASE_DIR / "ShrekAI" / "web_model" / "tokenizer_fixed.json"


# ============================================================
# LOAD TOKENIZER
# ============================================================

print("Loading tokenizer:")
print(INPUT)

if not INPUT.exists():
    raise FileNotFoundError(
        f"Tokenizer not found:\n{INPUT}"
    )

with INPUT.open("r", encoding="utf-8") as f:
    tokenizer = json.load(f)


# ============================================================
# VALIDATE
# ============================================================

subwords = tokenizer["subwords"]

if not isinstance(subwords, list):
    raise ValueError(
        "Expected tokenizer['subwords'] to be a list."
    )

start_id = int(
    tokenizer["subword_start_id"]
)

vocab_size = int(
    tokenizer["vocab_size"]
)

expected_count = (
    vocab_size - start_id
)

print()
print("Vocabulary size:", vocab_size)
print("Subword start ID:", start_id)
print("Expected subwords:", expected_count)
print("Found subwords:", len(subwords))


if len(subwords) != expected_count:
    raise ValueError(
        f"Expected {expected_count} subwords, "
        f"but found {len(subwords)}."
    )


# ============================================================
# CONVERT ARRAY → OBJECT
# ============================================================

converted = {}

for index, token in enumerate(subwords):

    if not isinstance(token, str):
        raise ValueError(
            f"Subword at index {index} is not a string."
        )

    if token in converted:
        raise ValueError(
            f"Duplicate subword found: {token!r}"
        )

    token_id = start_id + index

    converted[token] = token_id


# ============================================================
# REPLACE SUBWORDS
# ============================================================

tokenizer["subwords"] = converted


# ============================================================
# SAVE
# ============================================================

with OUTPUT.open(
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        tokenizer,
        f,
        ensure_ascii=False,
        indent=2
    )


# ============================================================
# DONE
# ============================================================

print()
print("========================================")
print("TOKENIZER CONVERSION COMPLETE")
print("========================================")
print()
print("Created:")
print(OUTPUT)
print()
print("Subwords:", len(converted))
print(
    "ID range:",
    start_id,
    "-",
    vocab_size - 1
)
print()
print("Example:")
print('"the":', converted.get("the"))
print('"and":', converted.get("and"))
print('"science":', converted.get("science"))