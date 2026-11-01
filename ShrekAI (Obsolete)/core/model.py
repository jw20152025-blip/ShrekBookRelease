from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM


MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "qwen3-0.6b-base"


class ShrekAIModel:
    def __init__(self):
        print("[ShrekAI] Loading Qwen3-0.6B-Base...")

        self.device = (
            "cuda"
            if torch.cuda.is_available()
            else "cpu"
        )

        print(f"[ShrekAI] Device: {self.device}")

        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_PATH,
            local_files_only=True,
        )

        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_PATH,
            local_files_only=True,
            torch_dtype=torch.float32,
        )

        self.model.to(self.device)
        self.model.eval()

        print("[ShrekAI] Qwen loaded successfully.")

    @torch.no_grad()
    def generate(
        self,
        prompt,
        max_new_tokens=128,
        temperature=0.8,
        top_p=0.9,
    ):
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
        )

        inputs = {
            key: value.to(self.device)
            for key, value in inputs.items()
        }

        output = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=True,
            pad_token_id=self.tokenizer.eos_token_id,
        )

        new_tokens = output[0][inputs["input_ids"].shape[1]:]

        return self.tokenizer.decode(
            new_tokens,
            skip_special_tokens=True,
        ).strip()