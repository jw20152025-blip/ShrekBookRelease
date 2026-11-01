import json
from pathlib import Path

import onnx
import torch

from config import (
    VOCAB_SIZE,
    D_MODEL,
    N_LAYERS,
    N_HEADS,
    FFN_MULTIPLIER,
    MAX_SEQ_LEN,
    DROPOUT,
    BIAS,
)

from core.model import (
    ShrekAI,
    ModelConfig,
)

from training.dataset import (
    ByteTokenizer,
)


# ============================================================
# SHREKAI ONNX EXPORTER
# ============================================================
#
# SOURCE MODEL:
#
#     checkpoints/latest.pt
#
# OUTPUT:
#
#     web_model/shrekai.onnx
#     web_model/tokenizer.json
#
# The original latest.pt is never modified.
#
# ============================================================


# ============================================================
# PATHS
# ============================================================

CHECKPOINT_PATH = Path(
    "checkpoints/latest.pt"
)

OUTPUT_DIR = Path(
    "web_model"
)

ONNX_PATH = (
    OUTPUT_DIR
    / "shrekai.onnx"
)

TOKENIZER_PATH = (
    OUTPUT_DIR
    / "tokenizer.json"
)


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cpu"
)


# ============================================================
# MODEL INFORMATION
# ============================================================

print()
print("=" * 70)
print("SHREKAI WEB EXPORT")
print("=" * 70)
print()

print(
    "Source checkpoint:"
)

print(
    f"  {CHECKPOINT_PATH}"
)

print()

print(
    "Model configuration:"
)

print(
    f"  Vocabulary:    {VOCAB_SIZE:,}"
)

print(
    f"  Dimensions:    {D_MODEL:,}"
)

print(
    f"  Layers:        {N_LAYERS}"
)

print(
    f"  Heads:         {N_HEADS}"
)

print(
    f"  FFN multiplier: {FFN_MULTIPLIER}"
)

print(
    f"  Max sequence:  {MAX_SEQ_LEN}"
)

print()


# ============================================================
# LOAD CHECKPOINT
# ============================================================

def load_checkpoint():

    print("=" * 70)
    print("LOADING CHECKPOINT")
    print("=" * 70)
    print()

    if not CHECKPOINT_PATH.exists():

        raise FileNotFoundError(
            "\n"
            "ShrekAI checkpoint was not found.\n"
            "\n"
            f"Expected:\n"
            f"  {CHECKPOINT_PATH.resolve()}\n"
            "\n"
            "Make sure checkpoints/latest.pt exists."
        )

    print(
        f"Found:\n"
        f"  {CHECKPOINT_PATH.resolve()}"
    )

    print()

    checkpoint = torch.load(
        CHECKPOINT_PATH,
        map_location="cpu",
        weights_only=False,
    )

    print(
        "Checkpoint loaded."
    )

    print()

    if isinstance(
        checkpoint,
        dict,
    ):

        print(
            "Checkpoint contents:"
        )

        for key in checkpoint.keys():

            print(
                f"  - {key}"
            )

    else:

        print(
            "Checkpoint is not a dictionary."
        )

    print()

    return checkpoint


# ============================================================
# EXTRACT MODEL STATE
# ============================================================

def extract_state_dict(checkpoint):
    print("=" * 70)
    print("SEARCHING FOR MODEL WEIGHTS")
    print("=" * 70)
    print()

    # --------------------------------------------------------
    # Direct state dictionary
    # --------------------------------------------------------

    if isinstance(checkpoint, dict):

        if "token_embedding.weight" in checkpoint:
            print("Found model weights directly in checkpoint.")
            print()
            return checkpoint

    # --------------------------------------------------------
    # Known checkpoint keys
    # --------------------------------------------------------

    if isinstance(checkpoint, dict):

        possible_keys = [
            "model",
            "model_state",
            "model_state_dict",
            "state_dict",
            "weights",
            "parameters",
            "shrekai",
        ]

        for key in possible_keys:

            if key not in checkpoint:
                continue

            value = checkpoint[key]

            print(
                f"Checking checkpoint['{key}']..."
            )

            if isinstance(value, dict):

                if "token_embedding.weight" in value:

                    print(
                        f"FOUND MODEL WEIGHTS IN: "
                        f"checkpoint['{key}']"
                    )

                    print()

                    return value

    # --------------------------------------------------------
    # Recursive search
    # --------------------------------------------------------

    def recursive_search(
        obj,
        path="checkpoint",
        depth=0,
        max_depth=8,
    ):

        if depth > max_depth:
            return None

        if isinstance(obj, dict):

            # Exact model key
            if "token_embedding.weight" in obj:

                print(
                    "FOUND MODEL WEIGHTS:"
                )

                print(
                    f"  {path}"
                )

                print()

                return obj

            for key, value in obj.items():

                result = recursive_search(
                    value,
                    f"{path}['{key}']",
                    depth + 1,
                    max_depth,
                )

                if result is not None:
                    return result

        elif isinstance(obj, (list, tuple)):

            for index, value in enumerate(obj):

                result = recursive_search(
                    value,
                    f"{path}[{index}]",
                    depth + 1,
                    max_depth,
                )

                if result is not None:
                    return result

        return None

    result = recursive_search(
        checkpoint
    )

    if result is not None:
        return result

    # --------------------------------------------------------
    # Print useful diagnostic information
    # --------------------------------------------------------

    print(
        "Could not automatically locate "
        "'token_embedding.weight'."
    )

    print()

    print(
        "Top-level checkpoint structure:"
    )

    if isinstance(checkpoint, dict):

        for key, value in checkpoint.items():

            if isinstance(value, dict):

                print(
                    f"  {key}: dict "
                    f"({len(value)} entries)"
                )

            elif torch.is_tensor(value):

                print(
                    f"  {key}: tensor "
                    f"{tuple(value.shape)}"
                )

            else:

                print(
                    f"  {key}: "
                    f"{type(value).__name__}"
                )

    else:

        print(
            f"Checkpoint type: "
            f"{type(checkpoint).__name__}"
        )

    print()

    raise RuntimeError(
        "\n"
        "Could not find ShrekAI model weights in "
        "checkpoints/latest.pt.\n"
        "\n"
        "The diagnostic information above shows "
        "the actual checkpoint structure."
    )

# ============================================================
# CREATE MODEL
# ============================================================

def create_model():

    print("=" * 70)
    print("CREATING CURRENT SHREKAI MODEL")
    print("=" * 70)
    print()

    config = ModelConfig(
        vocab_size=VOCAB_SIZE,
        d_model=D_MODEL,
        n_layers=N_LAYERS,
        n_heads=N_HEADS,
        ffn_multiplier=FFN_MULTIPLIER,
        max_seq_len=MAX_SEQ_LEN,
        dropout=DROPOUT,
        bias=BIAS,
    )

    model = ShrekAI(
        config
    )

    model.to(
        DEVICE
    )

    model.eval()

    print(
        "Model created."
    )

    print()

    print(
        f"Parameters: "
        f"{model.count_parameters():,}"
    )

    print()

    return model


# ============================================================
# LOAD MODEL WEIGHTS
# ============================================================

def load_model_weights(
    model,
    state,
):

    print("=" * 70)
    print("LOADING MODEL WEIGHTS")
    print("=" * 70)
    print()

    if (
        "token_embedding.weight"
        not in state
    ):

        raise RuntimeError(
            "Checkpoint is missing "
            "'token_embedding.weight'."
        )

    checkpoint_vocab = (
        state[
            "token_embedding.weight"
        ].shape[0]
    )

    checkpoint_dimension = (
        state[
            "token_embedding.weight"
        ].shape[1]
    )

    print(
        "Checkpoint embedding:"
    )

    print(
        f"  Vocabulary: "
        f"{checkpoint_vocab:,}"
    )

    print(
        f"  Dimension: "
        f"{checkpoint_dimension:,}"
    )

    print()

    print(
        "Current model:"
    )

    print(
        f"  Vocabulary: "
        f"{VOCAB_SIZE:,}"
    )

    print(
        f"  Dimension: "
        f"{D_MODEL:,}"
    )

    print()

    # --------------------------------------------------------
    # Check embedding dimension
    # --------------------------------------------------------

    if (
        checkpoint_dimension
        != D_MODEL
    ):

        raise RuntimeError(
            "\n"
            "Checkpoint/model dimension mismatch.\n"
            "\n"
            f"Checkpoint: {checkpoint_dimension}\n"
            f"Current:    {D_MODEL}"
        )

    # --------------------------------------------------------
    # Legacy vocabulary
    # --------------------------------------------------------

    if (
        checkpoint_vocab
        < VOCAB_SIZE
    ):

        print(
            "Legacy vocabulary detected."
        )

        print(
            f"Migrating "
            f"{checkpoint_vocab:,} → "
            f"{VOCAB_SIZE:,} tokens."
        )

        print()

        model.load_legacy_state_dict(
            state,
            legacy_vocab_size=checkpoint_vocab,
        )

    # --------------------------------------------------------
    # Current vocabulary
    # --------------------------------------------------------

    elif (
        checkpoint_vocab
        == VOCAB_SIZE
    ):

        print(
            "Checkpoint vocabulary matches current model."
        )

        print()

        model.load_state_dict(
            state,
            strict=True,
        )

    # --------------------------------------------------------
    # Checkpoint is newer/larger
    # --------------------------------------------------------

    else:

        raise RuntimeError(
            "\n"
            "Checkpoint vocabulary is larger than "
            "the current model vocabulary.\n"
            "\n"
            f"Checkpoint: {checkpoint_vocab}\n"
            f"Current:    {VOCAB_SIZE}\n"
            "\n"
            "Do not export this checkpoint until the "
            "model configuration matches it."
        )

    model.eval()

    print(
        "Model weights loaded successfully."
    )

    print()

    return model


# ============================================================
# EXPORT WRAPPER
# ============================================================

class ShrekAIExportWrapper(
    torch.nn.Module
):

    def __init__(
        self,
        model,
    ):

        super().__init__()

        self.model = model

    def forward(
        self,
        input_ids,
    ):

        logits, _ = self.model(
            input_ids
        )

        return logits


# ============================================================
# CREATE TEST INPUT
# ============================================================

def create_dummy_input():

    # --------------------------------------------------------
    # Exact special-token IDs from dataset.py
    # --------------------------------------------------------
    #
    # <|user|>      = 259
    # <|end|>       = 262
    # <|assistant|> = 260
    #
    # Raw UTF-8 byte tokens are 0-255.
    #
    # --------------------------------------------------------

    tokens = [
        259,       # <|user|>

        ord("H"),
        ord("i"),

        262,       # <|end|>

        260,       # <|assistant|>
    ]

    return torch.tensor(
        [tokens],
        dtype=torch.long,
        device=DEVICE,
    )


# ============================================================
# PYTORCH TEST
# ============================================================

def test_pytorch_model(
    model,
):

    print("=" * 70)
    print("TESTING PYTORCH MODEL")
    print("=" * 70)
    print()

    dummy_input = (
        create_dummy_input()
    )

    print(
        "Input shape:"
    )

    print(
        f"  {tuple(dummy_input.shape)}"
    )

    print()

    with torch.no_grad():

        logits, loss = model(
            dummy_input
        )

    print(
        "Output shape:"
    )

    print(
        f"  {tuple(logits.shape)}"
    )

    print()

    expected_shape = (
        1,
        dummy_input.shape[1],
        VOCAB_SIZE,
    )

    if (
        tuple(logits.shape)
        != expected_shape
    ):

        raise RuntimeError(
            "\n"
            "Unexpected PyTorch output shape.\n"
            "\n"
            f"Expected: {expected_shape}\n"
            f"Got:      {tuple(logits.shape)}"
        )

    print(
        "PyTorch test: PASS"
    )

    print()


# ============================================================
# EXPORT ONNX
# ============================================================

def export_onnx(
    model,
):

    print("=" * 70)
    print("EXPORTING ONNX")
    print("=" * 70)
    print()

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    wrapper = (
        ShrekAIExportWrapper(
            model
        )
    )

    wrapper.eval()

    dummy_input = (
        create_dummy_input()
    )

    print(
        "Export configuration:"
    )

    print(
        f"  Input:       input_ids"
    )

    print(
        f"  Output:      logits"
    )

    print(
        f"  Opset:       20"
    )

    print(
        f"  Dynamic batch: YES"
    )

    print(
        f"  Dynamic sequence: YES"
    )

    print()

    print(
        "Starting ONNX export..."
    )

    print(
        "This may take a while."
    )

    print()

    torch.onnx.export(
        wrapper,

        (
            dummy_input,
        ),

        str(
            ONNX_PATH
        ),

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

        opset_version=20,

        dynamo=True,
    )

    print()

    print(
        "ONNX export complete."
    )

    print()

    print(
        f"File:"
    )

    print(
        f"  {ONNX_PATH.resolve()}"
    )

    print()


# ============================================================
# VERIFY ONNX
# ============================================================

def verify_onnx():

    print("=" * 70)
    print("VERIFYING ONNX MODEL")
    print("=" * 70)
    print()

    if not ONNX_PATH.exists():

        raise FileNotFoundError(
            "ONNX file was not created."
        )

    print(
        "Loading ONNX model..."
    )

    model = onnx.load(
        str(
            ONNX_PATH
        )
    )

    print(
        "Running ONNX checker..."
    )

    onnx.checker.check_model(
        model
    )

    print()

    print(
        "ONNX checker: PASS"
    )

    print()

    file_size_mb = (
        ONNX_PATH.stat().st_size
        / (
            1024
            * 1024
        )
    )

    print(
        f"ONNX file size: "
        f"{file_size_mb:.2f} MB"
    )

    print()


# ============================================================
# EXPORT TOKENIZER
# ============================================================

def export_tokenizer():

    print("=" * 70)
    print("EXPORTING TOKENIZER")
    print("=" * 70)
    print()

    tokenizer = ByteTokenizer(
        auto_build=False
    )

    print(
        f"Loaded learned subwords:"
    )

    print(
        f"  {len(tokenizer.subwords):,}"
    )

    print()

    # --------------------------------------------------------
    # Verify vocabulary size
    # --------------------------------------------------------

    calculated_vocab_size = (
        263
        + len(
            tokenizer.subwords
        )
    )

    print(
        "Tokenizer vocabulary:"
    )

    print(
        f"  Config:     {VOCAB_SIZE:,}"
    )

    print(
        f"  Calculated: {calculated_vocab_size:,}"
    )

    print()

    if (
        calculated_vocab_size
        > VOCAB_SIZE
    ):

        raise RuntimeError(
            "\n"
            "Tokenizer contains more tokens than "
            "the model vocabulary."
        )

    # --------------------------------------------------------
    # Export
    # --------------------------------------------------------

    tokenizer_data = {

        "version": 1,

        "vocab_size":
            VOCAB_SIZE,

        "base_vocab_size":
            263,

        "subword_start_id":
            263,

        "special_tokens":
            tokenizer.special_tokens,

        "subwords":
            tokenizer.subwords,
    }

    with open(
        TOKENIZER_PATH,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            tokenizer_data,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print(
        "Tokenizer exported:"
    )

    print(
        f"  {TOKENIZER_PATH.resolve()}"
    )

    print()


# ============================================================
# TEST TOKENIZER
# ============================================================

def test_tokenizer():

    print("=" * 70)
    print("TESTING TOKENIZER")
    print("=" * 70)
    print()

    tokenizer = ByteTokenizer(
        auto_build=False
    )

    test_text = (
        "<|user|>\n"
        "Hello ShrekAI!\n"
        "<|end|>\n"
        "<|assistant|>\n"
    )

    encoded = tokenizer.encode(
        test_text,
        add_special_tokens=False,
    )

    decoded = tokenizer.decode(
        encoded,
        skip_special_tokens=False,
    )

    print(
        "Test text:"
    )

    print(
        repr(test_text)
    )

    print()

    print(
        "Encoded tokens:"
    )

    print(
        encoded
    )

    print()

    print(
        "Decoded text:"
    )

    print(
        repr(decoded)
    )

    print()

    if (
        decoded
        != test_text
    ):

        raise RuntimeError(
            "\n"
            "Tokenizer round-trip test failed."
        )

    print(
        "Tokenizer test: PASS"
    )

    print()


# ============================================================
# MAIN
# ============================================================

def main():

    # --------------------------------------------------------
    # Load latest.pt
    # --------------------------------------------------------

    checkpoint = (
        load_checkpoint()
    )

    # --------------------------------------------------------
    # Extract weights
    # --------------------------------------------------------

    state = (
        extract_state_dict(
            checkpoint
        )
    )

    # --------------------------------------------------------
    # Create current model
    # --------------------------------------------------------

    model = (
        create_model()
    )

    # --------------------------------------------------------
    # Load weights
    # --------------------------------------------------------

    model = (
        load_model_weights(
            model,
            state,
        )
    )

    # --------------------------------------------------------
    # Test PyTorch
    # --------------------------------------------------------

    test_pytorch_model(
        model
    )

    # --------------------------------------------------------
    # Test tokenizer
    # --------------------------------------------------------

    test_tokenizer()

    # --------------------------------------------------------
    # Export
    # --------------------------------------------------------

    export_onnx(
        model
    )

    # --------------------------------------------------------
    # Verify
    # --------------------------------------------------------

    verify_onnx()

    # --------------------------------------------------------
    # Export tokenizer
    # --------------------------------------------------------

    export_tokenizer()

    # --------------------------------------------------------
    # Final message
    # --------------------------------------------------------

    print("=" * 70)
    print("SHREKAI WEB EXPORT COMPLETE")
    print("=" * 70)
    print()

    print(
        "Generated files:"
    )

    print()

    print(
        f"  {ONNX_PATH}"
    )

    print(
        f"  {TOKENIZER_PATH}"
    )

    print()

    print(
        "Source model:"
    )

    print(
        f"  {CHECKPOINT_PATH}"
    )

    print()

    print(
        "IMPORTANT:"
    )

    print(
        "  latest.pt was only READ."
    )

    print(
        "  latest.pt was NOT modified."
    )

    print(
        "  latest.pt was NOT moved."
    )

    print(
        "  latest.pt was NOT copied into GitHub."
    )

    print()

    print(
        "Next step:"
    )

    print(
        "  Test the generated ONNX model in the browser."
    )

    print()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()