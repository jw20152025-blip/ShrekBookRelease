# ShrekAI — Qwen3 training system

This is the replacement training workspace for ShrekAI. It uses **Qwen/Qwen3-0.6B** as a fixed base model and trains portable **LoRA adapters** instead of changing the tokenizer or rebuilding a custom vocabulary.

## Hardware profile

Defaults are conservative for the Windows Dell all-in-one with 32 GB system RAM and an NVIDIA MX570 with 2 GB VRAM:

- 4-bit base-model loading when CUDA + bitsandbytes are available
- micro-batch 1, gradient accumulation 16 (effective batch 16)
- 256-token sequence length to keep VRAM use controlled
- gradient checkpointing, mixed precision, TF32 where supported
- LoRA rank 8; only adapter weights are trained
- automatic CPU fallback if 4-bit CUDA loading is unavailable

The MX570 has very limited VRAM. This setup is designed to attempt efficient adapter training, not full-model training. If the CUDA backend cannot fit, CPU fallback is compatible but will be substantially slower.

## One-command setup, import and training

From the repository root in Windows PowerShell or Command Prompt:

```bat
ShrekAI\install_import_train.bat
```

The command creates a virtual environment, installs dependencies, downloads the base model and English datasets, prepares the local dataset, then starts LoRA training. The first run downloads several gigabytes depending on Hugging Face cache and dataset revisions. Keep the computer plugged in and allow the process to finish.

To only install and download/prepare data without training:

```bat
ShrekAI\install_import_train.bat --prepare-only
```

To train again after adding or editing data in `ShrekAI\data\custom.jsonl`:

```bat
ShrekAI\train.bat
```

Custom JSONL accepts either:
- `{"text":"A plain English training passage."}`
- `{"messages":[{"role":"user","content":"Question"},{"role":"assistant","content":"Answer"}]}`

Each line must be valid JSON. Keep the content you have permission to use.

## Dataset sources

The importer fetches:
- WikiText-103 (English Wikipedia-derived text; review the dataset release's CC BY-SA terms before redistribution)
- OpenAssistant OASST1 (English instruction conversations; Apache-2.0)

It filters OASST1 to English and excludes deleted / unsuitable records. Dataset versions and source metadata are recorded in `data/manifest.json`. The complete corpora are downloaded locally; they are not committed to Git. To keep the first run practical on the 2 GB GPU, training defaults to a shuffled 250,000-record slice and up to 8,000 validation records. Raise `max_train_records` in `config.json` to train on more of the imported corpus.

## Portable weights and data changes

The tokenizer and base model are pinned to the same model identifier and revision in every run. Do **not** train a new tokenizer or change token IDs. That is what keeps adapter weights compatible.

- Checkpoints are LoRA adapter weights plus a metadata file.
- A changed or expanded dataset only requires rerunning the importer/trainer; it does not require translating token IDs.
- The metadata records the resolved base-model commit, tokenizer, sequence length, LoRA configuration and dataset SHA-256 fingerprint. Chat and merge use that same recorded base revision.
- An adapter is portable to another machine only when that machine uses the same base-model architecture/revision and tokenizer.
- Changing to a different base model or tokenizer is not a safe weight conversion; it requires a new adapter or a deliberate migration.

## English quality

The data pipeline is English-focused and filters the conversational corpus to English. WikiText-103 is English. No training run can guarantee that a model knows **100% of English** or never makes mistakes. Use the held-out validation split and add carefully reviewed examples for gaps.

## Important

This workspace does not silently claim that ShrekBook's hosted chat endpoint is now running this local model. The training system creates a local Qwen3 base download and LoRA adapter under `ShrekAI\models` and `ShrekAI\outputs`. Connecting the trained adapter to the live ShrekBook service is a separate deployment step.
