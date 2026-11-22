from __future__ import annotations

import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
ADAPTER = ROOT / "outputs" / "final-adapter"
BASE = CONFIG["base_model"]


def main():
    if not ADAPTER.exists():
        raise SystemExit("No trained adapter found. Run train.bat first.")
    print("[ShrekAI] Loading base model and trained adapter...")
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    base = AutoModelForCausalLM.from_pretrained(
        BASE,
        revision=CONFIG["base_revision"],
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    ).to(device)
    model = PeftModel.from_pretrained(base, ADAPTER).eval()
    history = []
    print("ShrekAI ready. Type /clear or /exit.")
    while True:
        try:
            prompt = input("\nYou: ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break
        if prompt.lower() == "/exit":
            break
        if prompt.lower() == "/clear":
            history.clear()
            print("Conversation cleared.")
            continue
        if not prompt:
            continue
        history.append({"role": "user", "content": prompt})
        rendered = tokenizer.apply_chat_template(
            history,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        inputs = tokenizer(
            rendered,
            return_tensors="pt",
            truncation=True,
            max_length=1024,
        ).to(device)
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=160,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                repetition_penalty=1.08,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        answer = tokenizer.decode(
            output[0][inputs["input_ids"].shape[1]:],
            skip_special_tokens=True,
        ).strip()
        print(f"\nShrekAI: {answer}")
        history.append({"role": "assistant", "content": answer})


if __name__ == "__main__":
    main()
