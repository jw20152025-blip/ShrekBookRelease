from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM


# ============================================================
# CONFIG
# ============================================================

MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "qwen3-0.6b-base"
)

MAX_NEW_TOKENS = 128
TEMPERATURE = 0.7
TOP_P = 0.9
REPETITION_PENALTY = 1.05


# ============================================================
# LOAD MODEL
# ============================================================

print("=" * 60)
print("SHREKAI - QWEN3-0.6B")
print("=" * 60)

print("\n[1/3] Loading tokenizer...")

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
)

print("[OK] Tokenizer loaded.")

print("\n[2/3] Loading model...")

device = "cuda" if torch.cuda.is_available() else "cpu"

model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
    torch_dtype=torch.float32,
)

model.to(device)
model.eval()

print("[OK] Model loaded.")
print(f"[OK] Device: {device}")

print("\n[3/3] Starting ShrekAI...")

# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """You are ShrekAI.

You are a helpful, witty, direct AI assistant.

Always respond in English unless the user explicitly asks for another language.

Answer the user's actual question.

Do not randomly switch languages.

Do not pretend to be another person.

Do not output internal chat formatting, role names, or conversation markers.

Do not repeat the user's message.

Keep your response coherent and conversational.
"""


# ============================================================
# CLEAN RESPONSE
# ============================================================

def clean_response(text: str) -> str:

    text = text.strip()

    bad_markers = [
        "<|user|>",
        "<|assistant|>",
        "<|system|>",
        "<|endoftext|>",
        "<|im_start|>",
        "<|im_end|>",
        "larınızıuser",
        "larınızıassistant",
        "larınızı",
    ]

    for marker in bad_markers:
        text = text.replace(marker, "")

    # Remove accidental role prefixes
    prefixes = [
        "assistant:",
        "Assistant:",
        "assistant",
        "Assistant",
    ]

    for prefix in prefixes:
        if text.startswith(prefix):
            text = text[len(prefix):].strip()

    return text.strip()


# ============================================================
# GENERATION
# ============================================================

@torch.no_grad()
def generate(prompt: str) -> str:

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": prompt,
        },
    ]

    # Qwen chat formatting
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )

    inputs = tokenizer(
        text,
        return_tensors="pt",
    )

    inputs = {
        key: value.to(device)
        for key, value in inputs.items()
    }

    output = model.generate(
        **inputs,

        max_new_tokens=MAX_NEW_TOKENS,

        temperature=TEMPERATURE,
        top_p=TOP_P,
        repetition_penalty=REPETITION_PENALTY,

        do_sample=True,

        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.eos_token_id,
    )

    # Only take newly generated tokens
    new_tokens = output[
        0,
        inputs["input_ids"].shape[1]:
    ]

    response = tokenizer.decode(
        new_tokens,
        skip_special_tokens=True,
    )

    return clean_response(response)


# ============================================================
# CHAT
# ============================================================

print()
print("=" * 60)
print("SHREKAI READY")
print("=" * 60)
print()
print("Type 'exit' or 'quit' to stop.")
print()


while True:

    try:
        prompt = input("You: ").strip()

    except KeyboardInterrupt:
        print("\n\nShrekAI stopped.")
        break

    except EOFError:
        print("\n\nShrekAI stopped.")
        break

    if not prompt:
        continue

    if prompt.lower() in {"exit", "quit"}:
        print("\nShrekAI stopped.")
        break

    try:

        response = generate(prompt)

        print()
        print(f"ShrekAI: {response}")
        print()

    except Exception as exc:

        print()
        print("[ERROR]")
        print(exc)
        print()