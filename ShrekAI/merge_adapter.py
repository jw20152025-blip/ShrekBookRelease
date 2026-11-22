from __future__ import annotations

import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
ADAPTER = ROOT / "outputs" / "final-adapter"
DESTINATION = ROOT / "outputs" / "merged-model"


def main():
    if not ADAPTER.exists():
        raise SystemExit("No adapter found. Train ShrekAI first.")
    metadata = json.loads(
        (ADAPTER / "shrekai_adapter_metadata.json").read_text(encoding="utf-8")
    )
    if metadata.get("base_model") != CONFIG["base_model"]:
        raise SystemExit("Base model mismatch; refusing to merge incompatible weights.")
    print("[ShrekAI] Loading base model for merge...")
    base = AutoModelForCausalLM.from_pretrained(
        CONFIG["base_model"],
        revision=CONFIG["base_revision"],
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, ADAPTER)
    print("[ShrekAI] Merging LoRA adapter into base weights...")
    merged = model.merge_and_unload()
    DESTINATION.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(
        DESTINATION,
        safe_serialization=True,
        max_shard_size="2GB",
    )
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER)
    tokenizer.save_pretrained(DESTINATION)
    (DESTINATION / "shrekai_model_metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    print(f"[ShrekAI] Merged model exported to {DESTINATION}")


if __name__ == "__main__":
    main()
