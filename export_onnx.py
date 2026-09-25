from pathlib import Path
import sys


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent
SHREKAI_ROOT = PROJECT_ROOT / "ShrekAI"

if not SHREKAI_ROOT.exists():
    raise FileNotFoundError(
        f"ShrekAI directory not found: {SHREKAI_ROOT}"
    )

if not (SHREKAI_ROOT / "config.py").exists():
    raise FileNotFoundError(
        f"ShrekAI/config.py not found: {SHREKAI_ROOT / 'config.py'}"
    )

if not (SHREKAI_ROOT / "core" / "model.py").exists():
    raise FileNotFoundError(
        f"ShrekAI/core/model.py not found: {SHREKAI_ROOT / 'core' / 'model.py'}"
    )


# ============================================================
# MAKE SHREKAI IMPORTABLE
# ============================================================

sys.path.insert(0, str(SHREKAI_ROOT))


# ============================================================
# THIRD-PARTY IMPORTS
# ============================================================

import torch
import torch.nn as nn
import onnx

from config import DEVICE
from core.model import ShrekAI, ModelConfig


# ============================================================
# FILES
# ============================================================

CHECKPOINT = (
    SHREKAI_ROOT
    / "checkpoints"
    / "latest.pt"
)

OUTPUT_DIR = (
    SHREKAI_ROOT
    / "web_model"
)

OUTPUT_MODEL = (
    OUTPUT_DIR
    / "shrekai.onnx"
)

EXTERNAL_DATA_FILE = (
    OUTPUT_DIR
    / "shrekai.onnx.data"
)


# ============================================================
# CHECKPOINT
# ============================================================

if not CHECKPOINT.exists():
    raise FileNotFoundError(
        f"Checkpoint not found:\n{CHECKPOINT}"
    )

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

print("=" * 70)
print("SHREKAI ONNX EXPORT")
print("=" * 70)

print()
print("Project root:")
print(PROJECT_ROOT)

print()
print("ShrekAI root:")
print(SHREKAI_ROOT)

print()
print("Checkpoint:")
print(CHECKPOINT)

print()
print("Output:")
print(OUTPUT_MODEL)


# ============================================================
# LOAD CHECKPOINT
# ============================================================

print()
print("[1/7] Loading checkpoint...")

checkpoint = torch.load(
    CHECKPOINT,
    map_location="cpu",
    weights_only=False
)

if isinstance(checkpoint, dict):

    if "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]

    elif "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]

    elif "model" in checkpoint and isinstance(
        checkpoint["model"],
        dict
    ):
        state_dict = checkpoint["model"]

    else:
        state_dict = checkpoint

else:
    raise RuntimeError(
        "Unsupported checkpoint format."
    )


# ============================================================
# CLEAN STATE DICT
# ============================================================

clean_state_dict = {}

for key, value in state_dict.items():

    if key.startswith("module."):
        key = key[7:]

    clean_state_dict[key] = value

state_dict = clean_state_dict


if "token_embedding.weight" not in state_dict:
    raise RuntimeError(
        "Checkpoint does not contain "
        "'token_embedding.weight'."
    )


print(
    "Checkpoint parameters:",
    len(state_dict)
)


# ============================================================
# BUILD MODEL
# ============================================================

print()
print("[2/7] Building ShrekAI model...")

config = ModelConfig()

model = ShrekAI(config)

model.eval()


# ============================================================
# LOAD WEIGHTS
# ============================================================

print()
print("[3/7] Loading model weights...")

checkpoint_vocab = (
    state_dict["token_embedding.weight"]
    .shape[0]
)

current_vocab = (
    config.vocab_size
)

print(
    "Checkpoint vocab:",
    checkpoint_vocab
)

print(
    "Model vocab:",
    current_vocab
)


if checkpoint_vocab != current_vocab:

    print(
        "Vocab mismatch detected."
    )

    model.load_legacy_state_dict(
        state_dict
    )

else:

    missing, unexpected = (
        model.load_state_dict(
            state_dict,
            strict=False
        )
    )

    if missing:
        print(
            "Missing keys:",
            missing
        )

    if unexpected:
        print(
            "Unexpected keys:",
            unexpected
        )


model.eval()


# ============================================================
# TEST PYTORCH
# ============================================================

print()
print("[4/7] Testing PyTorch model...")

dummy_input = torch.tensor(
    [[
        259,
        100,
        101,
        102,
        260
    ]],
    dtype=torch.long
)

with torch.no_grad():

    test_logits, _ = model(
        dummy_input
    )

print(
    "PyTorch output shape:",
    tuple(test_logits.shape)
)


# ============================================================
# WRAPPER
# ============================================================

class ONNXWrapper(nn.Module):

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids):

        logits, _ = self.model(
            input_ids
        )

        return logits


wrapper = ONNXWrapper(model)
wrapper.eval()


# ============================================================
# REMOVE OLD FILES
# ============================================================

print()
print("[5/7] Removing old web model files...")

if OUTPUT_MODEL.exists():
    OUTPUT_MODEL.unlink()

if EXTERNAL_DATA_FILE.exists():
    EXTERNAL_DATA_FILE.unlink()


# ============================================================
# EXPORT
# ============================================================

print()
print("[6/7] Exporting ONNX model...")

torch.onnx.export(
    wrapper,
    dummy_input,
    str(OUTPUT_MODEL),

    input_names=[
        "input_ids"
    ],

    output_names=[
        "logits"
    ],

    dynamic_axes={
        "input_ids": {
            0: "batch",
            1: "sequence"
        },

        "logits": {
            0: "batch",
            1: "sequence"
        }
    },

    opset_version=18,

    do_constant_folding=True,

    external_data=False
)


# ============================================================
# VALIDATE
# ============================================================

print()
print("[7/7] Validating ONNX model...")

onnx_model = onnx.load(
    str(OUTPUT_MODEL),
    load_external_data=False
)

onnx.checker.check_model(
    onnx_model
)


# ============================================================
# CHECK EXTERNAL DATA
# ============================================================

external_initializers = []

for initializer in onnx_model.graph.initializer:

    if initializer.external_data:
        external_initializers.append(
            initializer.name
        )


if external_initializers:

    raise RuntimeError(
        "ONNX model STILL contains external data references:\n"
        + "\n".join(external_initializers)
    )


if EXTERNAL_DATA_FILE.exists():

    raise RuntimeError(
        f"External data file was created unexpectedly:\n"
        f"{EXTERNAL_DATA_FILE}"
    )


# ============================================================
# FINAL
# ============================================================

print()
print("=" * 70)
print("SUCCESS")
print("=" * 70)

print()
print("ONNX model:")
print(OUTPUT_MODEL)

print()
print(
    "Model size:",
    OUTPUT_MODEL.stat().st_size,
    "bytes"
)

print()
print("External data: NONE")

print()
print("ONNX checker: PASSED")

print()
print("=" * 70)