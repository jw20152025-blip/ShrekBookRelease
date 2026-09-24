import sys
from pathlib import Path


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent
SHREKAI_ROOT = PROJECT_ROOT / "ShrekAI"

if not SHREKAI_ROOT.exists():
    raise FileNotFoundError(
        f"ShrekAI directory not found:\n{SHREKAI_ROOT}"
    )

if not (SHREKAI_ROOT / "config.py").exists():
    raise FileNotFoundError(
        f"config.py not found:\n{SHREKAI_ROOT / 'config.py'}"
    )

if not (SHREKAI_ROOT / "core" / "model.py").exists():
    raise FileNotFoundError(
        f"model.py not found:\n"
        f"{SHREKAI_ROOT / 'core' / 'model.py'}"
    )


# Put ShrekAI FIRST on Python's import path.
sys.path.insert(0, str(SHREKAI_ROOT))


# ============================================================
# THIRD-PARTY IMPORTS
# ============================================================

import torch
import torch.nn as nn
import onnx


# ============================================================
# SHREKAI IMPORTS
# ============================================================

from config import DEVICE
from core.model import ShrekAI, ModelConfig


# ============================================================
# PATHS
# ============================================================

CHECKPOINT = SHREKAI_ROOT / "checkpoints" / "latest.pt"

OUTPUT_DIR = SHREKAI_ROOT / "web_model"

OUTPUT_MODEL = OUTPUT_DIR / "shrekai.onnx"

EXTERNAL_DATA_FILE = OUTPUT_DIR / "shrekai.onnx.data"


# ============================================================
# INFERENCE WRAPPER
# ============================================================

class ShrekAIInference(nn.Module):

    def __init__(self, model):

        super().__init__()

        self.model = model

    def forward(self, input_ids):

        logits, _ = self.model(
            input_ids,
            targets=None,
        )

        return logits


# ============================================================
# LOAD CHECKPOINT
# ============================================================

def load_checkpoint(model):

    print()
    print("=" * 60)
    print("LOADING SHREKAI CHECKPOINT")
    print("=" * 60)

    print()
    print("Checkpoint:")
    print(CHECKPOINT)

    if not CHECKPOINT.exists():

        raise FileNotFoundError(
            f"Checkpoint not found:\n{CHECKPOINT}"
        )

    checkpoint = torch.load(
        CHECKPOINT,
        map_location="cpu",
        weights_only=False,
    )

    print()
    print(
        "Checkpoint type:",
        type(checkpoint).__name__,
    )

    # --------------------------------------------------------
    # Find state dictionary
    # --------------------------------------------------------

    if isinstance(checkpoint, dict):

        if "model_state_dict" in checkpoint:

            state = checkpoint[
                "model_state_dict"
            ]

        elif "state_dict" in checkpoint:

            state = checkpoint[
                "state_dict"
            ]

        elif "model" in checkpoint:

            state = checkpoint[
                "model"
            ]

        else:

            state = checkpoint

    else:

        raise RuntimeError(
            "Unsupported checkpoint format."
        )

    # --------------------------------------------------------
    # Remove module. prefix if present
    # --------------------------------------------------------

    cleaned_state = {}

    for key, value in state.items():

        if key.startswith("module."):

            key = key[len("module."):]

        cleaned_state[key] = value

    print(
        "Parameters in checkpoint:",
        len(cleaned_state),
    )

    # --------------------------------------------------------
    # Find embedding
    # --------------------------------------------------------

    embedding = cleaned_state.get(
        "token_embedding.weight"
    )

    if embedding is None:

        raise RuntimeError(
            "Checkpoint does not contain "
            "'token_embedding.weight'."
        )

    checkpoint_vocab = embedding.shape[0]

    current_vocab = model.config.vocab_size

    print(
        "Checkpoint vocabulary:",
        checkpoint_vocab,
    )

    print(
        "Current vocabulary:",
        current_vocab,
    )

    # --------------------------------------------------------
    # Vocabulary migration
    # --------------------------------------------------------

    if checkpoint_vocab < current_vocab:

        print()
        print(
            "Legacy vocabulary detected."
        )

        print(
            "Migrating checkpoint..."
        )

        model.load_legacy_state_dict(
            cleaned_state,
            legacy_vocab_size=checkpoint_vocab,
        )

    elif checkpoint_vocab > current_vocab:

        raise RuntimeError(
            "Checkpoint vocabulary is larger "
            "than the current model vocabulary.\n"
            f"Checkpoint: {checkpoint_vocab}\n"
            f"Current:    {current_vocab}"
        )

    else:

        model.load_state_dict(
            cleaned_state,
            strict=True,
        )

    print()
    print(
        "✅ Checkpoint loaded."
    )

    return model


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 60)
    print("SHREKAI → ONNX WEB EXPORT")
    print("=" * 60)

    # --------------------------------------------------------
    # Show paths
    # --------------------------------------------------------

    print()
    print("PROJECT ROOT:")
    print(PROJECT_ROOT)

    print()
    print("SHREKAI ROOT:")
    print(SHREKAI_ROOT)

    # --------------------------------------------------------
    # Model configuration
    # --------------------------------------------------------

    config = ModelConfig()

    print()
    print("MODEL CONFIG")
    print("-" * 60)

    print(
        "Vocabulary:",
        config.vocab_size,
    )

    print(
        "Embedding:",
        config.d_model,
    )

    print(
        "Layers:",
        config.n_layers,
    )

    print(
        "Heads:",
        config.n_heads,
    )

    print(
        "FFN multiplier:",
        config.ffn_multiplier,
    )

    print(
        "Maximum sequence:",
        config.max_seq_len,
    )

    # --------------------------------------------------------
    # Create model
    # --------------------------------------------------------

    print()
    print("Creating model...")

    model = ShrekAI(config)

    model.eval()

    # --------------------------------------------------------
    # Load checkpoint
    # --------------------------------------------------------

    model = load_checkpoint(model)

    model.eval()

    # --------------------------------------------------------
    # Disable gradient checkpointing
    # --------------------------------------------------------

    model.disable_gradient_checkpointing()

    # --------------------------------------------------------
    # Create inference wrapper
    # --------------------------------------------------------

    wrapper = ShrekAIInference(model)

    wrapper.eval()

    # --------------------------------------------------------
    # Dummy input
    # --------------------------------------------------------

    dummy_input = torch.tensor(
        [[
            258,  # <|system|>
            259,  # <|user|>
            260,  # <|assistant|>
        ]],
        dtype=torch.long,
    )

    print()
    print(
        "Dummy input shape:",
        tuple(dummy_input.shape),
    )

    # --------------------------------------------------------
    # Test PyTorch inference
    # --------------------------------------------------------

    print()
    print("Testing PyTorch model...")

    with torch.no_grad():

        pytorch_logits = wrapper(
            dummy_input
        )

    print(
        "PyTorch output shape:",
        tuple(pytorch_logits.shape),
    )

    expected_shape = (
        1,
        dummy_input.shape[1],
        config.vocab_size,
    )

    if tuple(pytorch_logits.shape) != expected_shape:

        raise RuntimeError(
            "Unexpected PyTorch output shape.\n"
            f"Expected: {expected_shape}\n"
            f"Got: {tuple(pytorch_logits.shape)}"
        )

    print(
        "✅ PyTorch inference works."
    )

    # --------------------------------------------------------
    # Prepare output directory
    # --------------------------------------------------------

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # --------------------------------------------------------
    # Remove old ONNX files
    # --------------------------------------------------------

    if OUTPUT_MODEL.exists():

        print()
        print(
            "Removing old ONNX model..."
        )

        OUTPUT_MODEL.unlink()

    if EXTERNAL_DATA_FILE.exists():

        print(
            "Removing stale external-data file..."
        )

        EXTERNAL_DATA_FILE.unlink()

    # --------------------------------------------------------
    # Export
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("EXPORTING ONNX")
    print("=" * 60)

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
                1: "sequence",
            },

            "logits": {
                0: "batch",
                1: "sequence",
            },
        },

        opset_version=18,

        do_constant_folding=True,

        external_data=False,
    )

    print()
    print(
        "✅ ONNX export completed."
    )

    print()
    print("Output:")
    print(OUTPUT_MODEL)

    # --------------------------------------------------------
    # Verify file
    # --------------------------------------------------------

    if not OUTPUT_MODEL.exists():

        raise RuntimeError(
            "ONNX file was not created."
        )

    size = OUTPUT_MODEL.stat().st_size

    print()
    print(
        "ONNX file size:",
        f"{size:,}",
        "bytes",
    )

    if size < 100_000:

        raise RuntimeError(
            "ONNX file is suspiciously small."
        )

    # --------------------------------------------------------
    # Load ONNX
    # --------------------------------------------------------

    print()
    print(
        "Checking ONNX model..."
    )

    onnx_model = onnx.load(
        str(OUTPUT_MODEL),
        load_external_data=False,
    )

    # --------------------------------------------------------
    # ONNX checker
    # --------------------------------------------------------

    onnx.checker.check_model(
        onnx_model
    )

    print(
        "✅ ONNX model is valid."
    )

    # --------------------------------------------------------
    # Check external data
    # --------------------------------------------------------

    external_references = []

    for initializer in onnx_model.graph.initializer:

        if initializer.external_data:

            external_references.append(
                initializer.name
            )

    if external_references:

        print()
        print(
            "External data references found:"
        )

        for name in external_references:

            print(
                " -",
                name,
            )

        raise RuntimeError(
            "The exported ONNX model still "
            "contains external data references."
        )

    print(
        "✅ No external .data file required."
    )

    # --------------------------------------------------------
    # Inputs
    # --------------------------------------------------------

    print()
    print("ONNX INPUTS")
    print("-" * 60)

    for input_tensor in onnx_model.graph.input:

        print(
            input_tensor.name
        )

    # --------------------------------------------------------
    # Outputs
    # --------------------------------------------------------

    print()
    print("ONNX OUTPUTS")
    print("-" * 60)

    for output_tensor in onnx_model.graph.output:

        print(
            output_tensor.name
        )

    # --------------------------------------------------------
    # Final external data check
    # --------------------------------------------------------

    if EXTERNAL_DATA_FILE.exists():

        raise RuntimeError(
            "shrekai.onnx.data still exists."
        )

    # --------------------------------------------------------
    # Success
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("🎉 SHREKAI ONNX EXPORT SUCCESSFUL")
    print("=" * 60)

    print()
    print("Web model:")
    print(OUTPUT_MODEL)

    print()
    print("web_model should contain:")

    print(
        "  shrekai.onnx"
    )

    print(
        "  tokenizer.json"
    )

    print(
        "  shrekai_web.js"
    )

    print()
    print("There should NOT be:")

    print(
        "  shrekai.onnx.data"
    )

    print()


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()