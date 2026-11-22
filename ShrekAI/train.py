from __future__ import annotations

import json
import platform
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
BASE_MODEL = CONFIG["base_model"]
MODEL_DIR = ROOT / CONFIG["model_dir"]
DATA_DIR = ROOT / CONFIG["dataset_dir"]
OUTPUT_DIR = ROOT / CONFIG["output_dir"]
MAX_LENGTH = int(CONFIG["max_seq_length"])


def load_base():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[ShrekAI] Loading {BASE_MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(
        BASE_MODEL,
        revision=CONFIG["base_revision"],
        use_fast=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization = None
    use_4bit = False
    if (
        CONFIG.get("use_4bit_if_available", True)
        and torch.cuda.is_available()
        and platform.system() != "Windows"
    ):
        try:
            from transformers import BitsAndBytesConfig
            import bitsandbytes  # noqa: F401
            quantization = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.float16,
            )
            use_4bit = True
            print("[ShrekAI] 4-bit CUDA loading enabled.")
        except Exception as exc:
            print(f"[ShrekAI] 4-bit backend unavailable; using standard loading: {exc}")

    if use_4bit:
        model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            revision=CONFIG["base_revision"],
            quantization_config=quantization,
            device_map="auto",
            torch_dtype=torch.float16,
        )
        model = prepare_model_for_kbit_training(
            model,
            use_gradient_checkpointing=True,
        )
    else:
        if torch.cuda.is_available():
            dtype = torch.float16
            device_map = "auto"
            print("[ShrekAI] Using CUDA FP16. If VRAM is insufficient, rerun with CUDA disabled.")
        else:
            dtype = torch.float32
            device_map = None
            print("[ShrekAI] Using CPU FP32. Compatible but slower.")
        model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            revision=CONFIG["base_revision"],
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
            device_map=device_map,
        )
        model.config.use_cache = False
        model.gradient_checkpointing_enable()

    model.config.use_cache = False
    model.enable_input_require_grads()
    lora = LoraConfig(
        r=int(CONFIG["lora_r"]),
        lora_alpha=int(CONFIG["lora_alpha"]),
        lora_dropout=float(CONFIG["lora_dropout"]),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()
    return model, tokenizer


def record_to_text(record, tokenizer):
    if isinstance(record.get("messages"), list):
        messages = record["messages"]
        safe_messages = []
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role in ("system", "user", "assistant") and isinstance(content, str):
                safe_messages.append({"role": role, "content": content})
        if not safe_messages:
            return ""
        return tokenizer.apply_chat_template(
            safe_messages,
            tokenize=False,
            add_generation_prompt=False,
        )
    text = record.get("text", "")
    if not isinstance(text, str) or not text.strip():
        return ""
    return (
        "<|im_start|>user\n"
        "Read the following English passage carefully. Continue it naturally "
        "using clear, correct English.\n"
        "<|im_end|>\n"
        "<|im_start|>assistant\n"
        + text.strip()
        + tokenizer.eos_token
    )


def main():
    if not (DATA_DIR / "train.jsonl").exists():
        raise SystemExit(
            "Training data is missing. Run ShrekAI\\prepare_data.py first."
        )
    if not (DATA_DIR / "validation.jsonl").exists():
        raise SystemExit("Validation data is missing. Run the data importer first.")

    model, tokenizer = load_base()
    raw = load_dataset(
        "json",
        data_files={
            "train": str(DATA_DIR / "train.jsonl"),
            "validation": str(DATA_DIR / "validation.jsonl"),
        },
    )

    def tokenize_batch(batch):
        texts = [
            record_to_text(
                {"text": text, "messages": messages},
                tokenizer,
            )
            for text, messages in zip(batch.get("text", [None] * len(batch["source"])),
                                      batch.get("messages", [None] * len(batch["source"])))
        ]
        return tokenizer(
            texts,
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False,
        )

    tokenized = raw.map(
        tokenize_batch,
        batched=True,
        remove_columns=raw["train"].column_names,
        desc="Tokenizing with the fixed Qwen tokenizer",
    )
    tokenized = tokenized.filter(lambda row: len(row["input_ids"]) >= 16)

    args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=float(CONFIG["epochs"]),
        per_device_train_batch_size=int(CONFIG["micro_batch_size"]),
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=int(CONFIG["gradient_accumulation_steps"]),
        learning_rate=float(CONFIG["learning_rate"]),
        warmup_ratio=float(CONFIG["warmup_ratio"]),
        weight_decay=float(CONFIG["weight_decay"]),
        logging_steps=int(CONFIG["logging_steps"]),
        save_steps=int(CONFIG["save_steps"]),
        eval_steps=int(CONFIG["eval_steps"]),
        eval_strategy="steps",
        save_strategy="steps",
        save_total_limit=3,
        fp16=torch.cuda.is_available(),
        bf16=False,
        gradient_checkpointing=True,
        optim="adamw_torch",
        lr_scheduler_type="cosine",
        report_to="none",
        dataloader_num_workers=0,
        group_by_length=True,
        remove_unused_columns=False,
        seed=int(CONFIG["seed"]),
    )
    collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        data_collator=collator,
        processing_class=tokenizer,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {
        "base_model": BASE_MODEL,
        "base_revision": CONFIG["base_revision"],
        "tokenizer": BASE_MODEL,
        "max_seq_length": MAX_LENGTH,
        "lora": {
            "r": CONFIG["lora_r"],
            "alpha": CONFIG["lora_alpha"],
            "dropout": CONFIG["lora_dropout"],
        },
        "dataset_manifest": str(DATA_DIR / "manifest.json"),
        "note": "Adapter requires the exact same base model revision and tokenizer.",
    }
    (OUTPUT_DIR / "shrekai_adapter_metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    print("[ShrekAI] Starting adapter training...")
    trainer.train(resume_from_checkpoint=True if list(OUTPUT_DIR.glob("checkpoint-*")) else None)
    final_dir = OUTPUT_DIR / "final-adapter"
    trainer.model.save_pretrained(final_dir, safe_serialization=True)
    tokenizer.save_pretrained(final_dir)
    (final_dir / "shrekai_adapter_metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    print(f"[ShrekAI] Training complete. Adapter saved to: {final_dir}")


if __name__ == "__main__":
    main()
