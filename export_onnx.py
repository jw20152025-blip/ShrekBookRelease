
from pathlib import Path
import os

import torch
import onnx
from transformers import AutoModelForCausalLM

PROJECT_ROOT = Path(__file__).resolve().parent
SHREKAI_ROOT = PROJECT_ROOT / "ShrekAI"

MODEL_PATH = SHREKAI_ROOT / "models" / "qwen3-0.6b-base"
OUTPUT_DIR = SHREKAI_ROOT / "web_model"

OUTPUT_MODEL = OUTPUT_DIR / "shrekai.onnx"
TEMP_MODEL = OUTPUT_DIR / "shrekai.exporting.onnx"

MAX_SEQUENCE_LENGTH = 256


class CausalLMExportWrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids):
        return self.model(
            input_ids=input_ids,
            use_cache=False,
            return_dict=True,
        ).logits


def main():
    if not MODEL_PATH.is_dir():
        raise FileNotFoundError(f"Model directory not found: {MODEL_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[ShrekAI] Loading local Qwen3 model...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH,
        local_files_only=True,
        dtype=torch.float32,
    )
    model.eval()
    model.config.use_cache = False

    wrapper = CausalLMExportWrapper(model).eval()

    sequence_length = min(
        MAX_SEQUENCE_LENGTH,
        getattr(
            model.config,
            "max_position_embeddings",
            MAX_SEQUENCE_LENGTH,
        ),
    )

    dummy_input = torch.zeros((1, sequence_length), dtype=torch.long)

    print(f"[ShrekAI] Vocabulary size: {model.config.vocab_size}")
    print(f"[ShrekAI] Export sequence length: {sequence_length}")
    print("[ShrekAI] Exporting ONNX...")

    try:
        with torch.no_grad():
            torch.onnx.export(
                wrapper,
                (dummy_input,),
                str(TEMP_MODEL),
                input_names=["input_ids"],
                output_names=["logits"],
                dynamic_shapes={
                    "input_ids": {
                        0: torch.export.Dim("batch_size", min=1),
                        1: torch.export.Dim(
                            "sequence_length",
                            min=1,
                            max=sequence_length,
                        ),
                    },
                },
                opset_version=18,
                dynamo=True,
                external_data=True,
            )

        print("[ShrekAI] Validating ONNX file on disk...")

        # Validate from the path so ONNX can handle external tensor data.
        onnx.checker.check_model(str(TEMP_MODEL), full_check=False)

        # Inspect graph metadata without loading all external weights.
        exported = onnx.load(str(TEMP_MODEL), load_external_data=False)

        input_names = [item.name for item in exported.graph.input]
        output_names = [item.name for item in exported.graph.output]

        if "input_ids" not in input_names:
            raise RuntimeError(f"Unexpected inputs: {input_names}")

        if "logits" not in output_names:
            raise RuntimeError(f"Unexpected outputs: {output_names}")

        print("[ShrekAI] ONNX validation successful.")
        print("[ShrekAI] Inputs:", input_names)
        print("[ShrekAI] Outputs:", output_names)

        # Keep the original ONNX filename while preserving its relative
        # external-data references and all data files created by the exporter.
        os.replace(TEMP_MODEL, OUTPUT_MODEL)

        print("[ShrekAI] Export completed.")
        print(f"[ShrekAI] Model: {OUTPUT_MODEL}")
        print(f"[ShrekAI] ONNX file size: {OUTPUT_MODEL.stat().st_size:,} bytes")

        # Report external data files without renaming them.
        for data_file in OUTPUT_DIR.glob(TEMP_MODEL.name + "*"):
            if data_file.is_file():
                print(f"[ShrekAI] Temporary export artifact: {data_file.name}")

        print(
            "[ShrekAI] Keep every referenced external-data file with the "
            "ONNX model when deploying."
        )

    finally:
        # Do not delete external data here: it may be referenced by the model.
        if TEMP_MODEL.exists():
            TEMP_MODEL.unlink()


if __name__ == "__main__":
    main()
