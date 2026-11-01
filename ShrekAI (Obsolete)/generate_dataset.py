import hashlib
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path


# ============================================================
# CONFIG
# ============================================================

ROOT = Path(__file__).resolve().parent

SOURCE_DIR = ROOT / "datasets" / "source"
OUTPUT_DIR = ROOT / "datasets" / "processed"

TRAINING_FILE = OUTPUT_DIR / "shrekai_training.jsonl"
VALIDATION_FILE = OUTPUT_DIR / "shrekai_validation.jsonl"
STATS_FILE = OUTPUT_DIR / "dataset_stats.json"

VALIDATION_RATIO = 0.02

RANDOM_SEED = 42069

# Maximum number of examples retained per category.
# Set to None for unlimited.
MAX_PER_CATEGORY = {
    "coding": 150_000,
    "science": 100_000,
    "math": 100_000,
    "reasoning": 100_000,
    "history": 75_000,
    "geography": 75_000,
    "conversations": 150_000,
    "instructions": 150_000,
    "personality": 25_000,
}

MIN_USER_LENGTH = 3
MIN_ASSISTANT_LENGTH = 3

MAX_USER_LENGTH = 20_000
MAX_ASSISTANT_LENGTH = 30_000


# ============================================================
# CATEGORY DETECTION
# ============================================================

CATEGORY_NAMES = set(MAX_PER_CATEGORY)


def detect_category(path: Path) -> str:
    """
    Detect category from:

        datasets/source/coding/example.jsonl

    or from the filename:

        coding_python.jsonl
    """

    parts = [part.lower() for part in path.parts]

    for category in CATEGORY_NAMES:
        if category in parts:
            return category

    filename = path.stem.lower()

    for category in CATEGORY_NAMES:
        if filename.startswith(category):
            return category

    return "general"


# ============================================================
# TEXT CLEANING
# ============================================================

def clean_text(text):
    if not isinstance(text, str):
        return ""

    text = text.replace("\x00", "")

    # Normalize whitespace without destroying code formatting.
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove trailing spaces.
    lines = [line.rstrip() for line in text.split("\n")]

    text = "\n".join(lines).strip()

    return text


def normalize_for_hash(text):
    """
    Used ONLY for duplicate detection.

    The actual stored text remains unchanged.
    """

    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def example_hash(example):
    messages = example["messages"]

    canonical = []

    for message in messages:
        canonical.append({
            "role": message["role"],
            "content": normalize_for_hash(message["content"]),
        })

    raw = json.dumps(
        canonical,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ============================================================
# VALIDATION
# ============================================================

VALID_ROLES = {
    "system",
    "user",
    "assistant",
    "tool",
}


def validate_messages(messages):
    if not isinstance(messages, list):
        return False

    if len(messages) < 2:
        return False

    has_user = False
    has_assistant = False

    for message in messages:

        if not isinstance(message, dict):
            return False

        role = message.get("role")
        content = message.get("content")

        if role not in VALID_ROLES:
            return False

        if not isinstance(content, str):
            return False

        content = content.strip()

        if not content:
            return False

        if role == "user":
            has_user = True

        if role == "assistant":
            has_assistant = True

    return has_user and has_assistant


def validate_example(example):
    if not isinstance(example, dict):
        return False

    messages = example.get("messages")

    if not validate_messages(messages):
        return False

    for message in messages:

        content = message["content"]

        if message["role"] == "user":
            if len(content) < MIN_USER_LENGTH:
                return False

            if len(content) > MAX_USER_LENGTH:
                return False

        elif message["role"] == "assistant":
            if len(content) < MIN_ASSISTANT_LENGTH:
                return False

            if len(content) > MAX_ASSISTANT_LENGTH:
                return False

    return True


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_example(example):
    messages = []

    for message in example["messages"]:

        role = message["role"]
        content = clean_text(message["content"])

        messages.append({
            "role": role,
            "content": content,
        })

    return {
        "messages": messages,
    }


# ============================================================
# JSONL READING
# ============================================================

def read_jsonl(path):
    with path.open(
        "r",
        encoding="utf-8",
        errors="replace",
    ) as file:

        for line_number, line in enumerate(file, start=1):

            line = line.strip()

            if not line:
                continue

            try:
                data = json.loads(line)

            except json.JSONDecodeError:
                print(
                    f"[WARN] Invalid JSON: "
                    f"{path}:{line_number}"
                )
                continue

            yield data


# ============================================================
# JSON READING
# ============================================================

def read_json(path):

    try:
        with path.open(
            "r",
            encoding="utf-8",
            errors="replace",
        ) as file:

            data = json.load(file)

    except Exception as exc:

        print(
            f"[WARN] Could not read {path}: {exc}"
        )

        return []

    if isinstance(data, list):
        return data

    if isinstance(data, dict):

        # Support:
        #
        # {"messages": [...]}
        #
        # and:
        #
        # {"examples": [...]}

        if "messages" in data:
            return [data]

        if "examples" in data:
            return data["examples"]

    return []


# ============================================================
# SOURCE DISCOVERY
# ============================================================

def find_source_files():

    if not SOURCE_DIR.exists():
        SOURCE_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )

    files = []

    files.extend(
        SOURCE_DIR.rglob("*.jsonl")
    )

    files.extend(
        SOURCE_DIR.rglob("*.json")
    )

    return sorted(set(files))


# ============================================================
# EXAMPLE ITERATOR
# ============================================================

def iterate_examples(path):

    if path.suffix.lower() == ".jsonl":

        yield from read_jsonl(path)

    elif path.suffix.lower() == ".json":

        yield from read_json(path)


# ============================================================
# MAIN COLLECTION
# ============================================================

def collect_examples():

    source_files = find_source_files()

    print()
    print("=" * 70)
    print("SHREKAI DATASET BUILDER")
    print("=" * 70)
    print()
    print(f"Source directory: {SOURCE_DIR}")
    print(f"Found files:      {len(source_files)}")
    print()

    category_examples = defaultdict(list)

    seen_hashes = set()

    stats = Counter()

    for source_file in source_files:

        category = detect_category(source_file)

        print(
            f"[READ] {source_file.relative_to(ROOT)} "
            f"-> {category}"
        )

        file_count = 0

        for raw_example in iterate_examples(source_file):

            stats["raw"] += 1

            example = normalize_example(
                raw_example
            )

            if not validate_example(example):

                stats["invalid"] += 1
                continue

            digest = example_hash(example)

            if digest in seen_hashes:

                stats["duplicates"] += 1
                continue

            seen_hashes.add(digest)

            limit = MAX_PER_CATEGORY.get(
                category
            )

            if (
                limit is not None
                and len(category_examples[category])
                >= limit
            ):
                stats["category_limit"] += 1
                continue

            category_examples[category].append(
                example
            )

            stats["valid"] += 1
            file_count += 1

        print(
            f"       accepted: {file_count:,}"
        )

    return category_examples, stats


# ============================================================
# CATEGORY BALANCING
# ============================================================

def balance_categories(category_examples):

    print()
    print("=" * 70)
    print("BALANCING DATASET")
    print("=" * 70)
    print()

    counts = {
        category: len(examples)
        for category, examples
        in category_examples.items()
    }

    for category in sorted(counts):

        print(
            f"{category:20s} "
            f"{counts[category]:>10,}"
        )

    non_empty = [
        count
        for count in counts.values()
        if count > 0
    ]

    if not non_empty:
        return []

    # The target is the median category size.
    #
    # This prevents one category containing
    # 5 million examples from completely
    # drowning out smaller categories.

    sorted_counts = sorted(non_empty)

    middle = len(sorted_counts) // 2

    if len(sorted_counts) % 2:
        target = sorted_counts[middle]

    else:
        target = (
            sorted_counts[middle - 1]
            + sorted_counts[middle]
        ) // 2

    target = max(target, 1)

    print()
    print(f"Balance target: {target:,}")
    print()

    rng = random.Random(RANDOM_SEED)

    balanced = []

    for category, examples in category_examples.items():

        if not examples:
            continue

        if len(examples) > target:

            examples = rng.sample(
                examples,
                target,
            )

        else:

            examples = list(examples)

        print(
            f"{category:20s} "
            f"{len(examples):>10,}"
        )

        for example in examples:
            balanced.append(
                (category, example)
            )

    return balanced


# ============================================================
# SHUFFLE
# ============================================================

def shuffle_examples(examples):

    rng = random.Random(
        RANDOM_SEED
    )

    rng.shuffle(examples)

    return examples


# ============================================================
# TRAIN / VALIDATION SPLIT
# ============================================================

def split_dataset(examples):

    validation_count = max(
        1,
        int(
            len(examples)
            * VALIDATION_RATIO
        ),
    )

    validation = examples[
        :validation_count
    ]

    training = examples[
        validation_count:
    ]

    return training, validation


# ============================================================
# JSONL WRITER
# ============================================================

def write_jsonl(path, examples):

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "w",
        encoding="utf-8",
        newline="\n",
    ) as file:

        for category, example in examples:

            # Category metadata is deliberately
            # NOT put into the training messages.
            #
            # The trainer receives only:
            #
            # {"messages": [...]}

            file.write(
                json.dumps(
                    example,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )


# ============================================================
# STATISTICS
# ============================================================

def calculate_stats(
    training,
    validation,
):

    category_counts = Counter()

    message_counts = Counter()

    characters = Counter()

    for category, example in (
        training + validation
    ):

        category_counts[category] += 1

        for message in example["messages"]:

            role = message["role"]

            message_counts[role] += 1

            characters[role] += len(
                message["content"]
            )

    return {
        "training_examples": len(training),
        "validation_examples": len(validation),
        "total_examples": (
            len(training)
            + len(validation)
        ),
        "categories": dict(
            sorted(category_counts.items())
        ),
        "messages_by_role": dict(
            sorted(message_counts.items())
        ),
        "characters_by_role": dict(
            sorted(characters.items())
        ),
        "validation_ratio": VALIDATION_RATIO,
        "random_seed": RANDOM_SEED,
    }


# ============================================================
# MAIN
# ============================================================

def main():

    category_examples, collection_stats = (
        collect_examples()
    )

    if not category_examples:

        print()
        print(
            "[ERROR] No valid training examples found."
        )
        print()
        print(
            "Put JSON/JSONL files inside:"
        )
        print(
            f"    {SOURCE_DIR}"
        )
        print()

        return

    balanced = balance_categories(
        category_examples
    )

    if not balanced:

        print(
            "[ERROR] Dataset is empty after balancing."
        )

        return

    balanced = shuffle_examples(
        balanced
    )

    training, validation = (
        split_dataset(balanced)
    )

    # Shuffle each split independently.

    training = shuffle_examples(
        training
    )

    validation = shuffle_examples(
        validation
    )

    print()
    print("=" * 70)
    print("WRITING DATASET")
    print("=" * 70)
    print()

    write_jsonl(
        TRAINING_FILE,
        training,
    )

    write_jsonl(
        VALIDATION_FILE,
        validation,
    )

    final_stats = calculate_stats(
        training,
        validation,
    )

    final_stats["collection"] = dict(
        collection_stats
    )

    with STATS_FILE.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            final_stats,
            file,
            indent=2,
            ensure_ascii=False,
        )

    print(
        f"Training:   {TRAINING_FILE}"
    )

    print(
        f"Validation: {VALIDATION_FILE}"
    )

    print(
        f"Stats:      {STATS_FILE}"
    )

    print()
    print("=" * 70)
    print("DONE")
    print("=" * 70)
    print()

    print(
        f"Training examples:   {len(training):,}"
    )

    print(
        f"Validation examples: {len(validation):,}"
    )

    print(
        f"Total examples:      {len(balanced):,}"
    )

    print()


if __name__ == "__main__":
    main()