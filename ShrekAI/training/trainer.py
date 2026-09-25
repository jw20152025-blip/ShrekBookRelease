import math
import os
import signal
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from config import (
    DEVICE,
    DTYPE,
    BATCH_SIZE,
    GRADIENT_ACCUMULATION_STEPS,
    LEARNING_RATE,
    MIN_LEARNING_RATE,
    WEIGHT_DECAY,
    BETAS,
    MAX_STEPS,
    WARMUP_STEPS,
    GRAD_CLIP,
    VALIDATION_INTERVAL,
    CHECKPOINT_INTERVAL,
    NUM_WORKERS,
    SEED,
    LATEST_CHECKPOINT,
    BEST_CHECKPOINT,
    FINAL_MODEL,
    USE_COMPILE,
    MAX_SEQ_LEN,
    DATASET_DIR,
    TRAINING_FILES,
    VOCAB_SIZE,
    BASE_VOCAB_SIZE,
)

from training.dataset import ShrekDataset, ByteTokenizer
from core.model import ShrekAI, ModelConfig
from training.evaluator import evaluate


# ============================================================
# CUDA PERFORMANCE SETTINGS
# ============================================================

if torch.cuda.is_available():

    try:
        torch.set_float32_matmul_precision("high")
    except Exception:
        pass

    try:
        torch.backends.cuda.matmul.allow_tf32 = True
    except Exception:
        pass

    try:
        torch.backends.cudnn.allow_tf32 = True
    except Exception:
        pass

    # Enable optimized scaled-dot-product attention kernels
    try:
        torch.backends.cuda.enable_flash_sdp(True)
    except Exception:
        pass

    try:
        torch.backends.cuda.enable_mem_efficient_sdp(True)
    except Exception:
        pass

    try:
        torch.backends.cuda.enable_math_sdp(True)
    except Exception:
        pass


# ============================================================
# SESSION SETTINGS
# ============================================================

SESSION_STEPS = 1_000

# Printing every step can become surprisingly expensive.
LOG_INTERVAL = 5

# Only controls the FAST/SLOW status display.
# It does NOT throttle training.
TARGET_SECONDS_PER_STEP = 1.0

# Safety checkpoints are intentionally less frequent because
# checkpointing a large model can stall training.
SAFETY_CHECKPOINT_INTERVAL = 250


# ============================================================
# WEB DATASET
# ============================================================

WEB_DATASET_FILE = Path(DATASET_DIR) / "web.jsonl"


# ============================================================
# TRAINER
# ============================================================


class Trainer:

    def __init__(self, training_mode="normal"):

        if training_mode not in ("normal", "web"):
            raise ValueError(
                "training_mode must be either 'normal' or 'web'"
            )

        self.training_mode = training_mode

        # ----------------------------------------------------
        # RANDOM SEEDS
        # ----------------------------------------------------

        torch.manual_seed(SEED)

        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(SEED)

        # ----------------------------------------------------
        # DEVICE
        # ----------------------------------------------------

        self.device = torch.device(DEVICE)

        # ----------------------------------------------------
        # SHUTDOWN STATE
        # ----------------------------------------------------

        self.shutdown_requested = False
        self.shutdown_in_progress = False

        self._install_signal_handlers()

        # ----------------------------------------------------
        # TOKENIZER
        # ----------------------------------------------------

        self.tokenizer = ByteTokenizer()

        # ----------------------------------------------------
        # MODEL
        # ----------------------------------------------------

        self.model = ShrekAI(
            ModelConfig()
        ).to(self.device)

        # ----------------------------------------------------
        # OPTIMIZER
        # ----------------------------------------------------

        self.optimizer = self._create_optimizer()

        # ----------------------------------------------------
        # TRAINING STATE
        # ----------------------------------------------------

        self.step = 0
        self.best_loss = float("inf")

        # ----------------------------------------------------
        # MIXED PRECISION
        # ----------------------------------------------------

        self.use_cuda = self.device.type == "cuda"

        self.use_amp = (
            self.use_cuda
            and DTYPE in (
                torch.float16,
                torch.bfloat16,
            )
        )

        self.use_grad_scaler = (
            self.use_amp
            and DTYPE == torch.float16
        )

        if self.use_grad_scaler:
            self.scaler = torch.amp.GradScaler(
                "cuda"
            )
        else:
            self.scaler = None

        # ----------------------------------------------------
        # DATASET
        # ----------------------------------------------------

        self.training_files = self._get_training_files()

        if not self.training_files:
            raise RuntimeError(
                "No training files were found."
            )

        self.dataset = ShrekDataset(
            self.training_files,
            self.tokenizer,
            MAX_SEQ_LEN,
        )

        # ----------------------------------------------------
        # DATA LOADER
        # ----------------------------------------------------

        loader_kwargs = {
            "dataset": self.dataset,
            "batch_size": BATCH_SIZE,
            "shuffle": True,
            "num_workers": NUM_WORKERS,
            "drop_last": False,
        }

        if self.use_cuda:

            loader_kwargs["pin_memory"] = True

        if NUM_WORKERS > 0:

            loader_kwargs["persistent_workers"] = True

            # More aggressive prefetching.
            loader_kwargs["prefetch_factor"] = 4

        self.loader = DataLoader(
            **loader_kwargs
        )

        self.loader_iterator = iter(self.loader)

        # ----------------------------------------------------
        # COMPILE
        # ----------------------------------------------------

        self.compiled = False

        if (
            USE_COMPILE
            and hasattr(torch, "compile")
        ):

            # Compilation is much more useful on CUDA.
            #
            # On CPU, compilation can sometimes spend more
            # time compiling than it saves.
            if self.use_cuda:

                try:

                    self.model = torch.compile(
                        self.model,
                        mode="max-autotune",
                        fullgraph=False,
                        dynamic=True,
                    )

                    self.compiled = True

                    print(
                        "[OK] torch.compile enabled "
                        "(max-autotune)"
                    )

                except Exception as exc:

                    print(
                        "[WARN] torch.compile failed:"
                    )
                    print(
                        f"       {exc}"
                    )
                    print(
                        "[WARN] Continuing without compile."
                    )

            else:

                print(
                    "[INFO] torch.compile skipped on CPU."
                )

        # ----------------------------------------------------
        # PERFORMANCE CACHE
        # ----------------------------------------------------

        self._last_log_time = time.perf_counter()
        self._training_start_time = time.perf_counter()

        self._tokens_this_session = 0
        self._steps_this_session = 0

        self._last_loss = 0.0
        self._last_grad_norm = 0.0

        # ----------------------------------------------------
        # STARTUP
        # ----------------------------------------------------

        self._print_startup_info()


    # ========================================================
    # SIGNAL HANDLING
    # ========================================================

    def _install_signal_handlers(self):

        def handler(signum, frame):

            if self.shutdown_requested:

                print(
                    "\n[STOP] Second shutdown signal received."
                )

                print(
                    "[STOP] Please wait for the current "
                    "operation to finish."
                )

                return

            self.shutdown_requested = True

            print(
                "\n[STOP] Shutdown requested."
            )

            print(
                "[STOP] Finishing the current optimizer step..."
            )

            print(
                "[STOP] A checkpoint will be saved."
            )

        try:
            signal.signal(
                signal.SIGINT,
                handler,
            )
        except Exception:
            pass

        try:
            signal.signal(
                signal.SIGTERM,
                handler,
            )
        except Exception:
            pass

        # Windows
        if hasattr(signal, "SIGBREAK"):

            try:
                signal.signal(
                    signal.SIGBREAK,
                    handler,
                )
            except Exception:
                pass


    # ========================================================
    # TRAINING FILES
    # ========================================================

    def _get_training_files(self):

        if self.training_mode == "web":

            if (
                not WEB_DATASET_FILE.exists()
                or WEB_DATASET_FILE.stat().st_size == 0
            ):

                raise RuntimeError(
                    "Web training was requested, but "
                    f"{WEB_DATASET_FILE} does not exist "
                    "or is empty."
                )

            return [
                WEB_DATASET_FILE
            ]

        files = []

        for file in TRAINING_FILES:

            path = Path(file)

            if path.exists() and path.stat().st_size > 0:
                files.append(path)

        if not files:

            raise RuntimeError(
                "No configured training files exist."
            )

        return files


    # ========================================================
    # OPTIMIZER
    # ========================================================

    def _create_optimizer(self):

        decay_parameters = []
        no_decay_parameters = []

        for name, parameter in self.model.named_parameters():

            if not parameter.requires_grad:
                continue

            if parameter.ndim >= 2:
                decay_parameters.append(parameter)
            else:
                no_decay_parameters.append(parameter)

        parameter_groups = [
            {
                "params": decay_parameters,
                "weight_decay": WEIGHT_DECAY,
            },
            {
                "params": no_decay_parameters,
                "weight_decay": 0.0,
            },
        ]

        # ----------------------------------------------------
        # FUSED ADAMW
        # ----------------------------------------------------

        use_fused = False

        if self.device.type == "cuda":

            try:

                # PyTorch exposes this argument only on builds
                # supporting fused AdamW.
                optimizer = torch.optim.AdamW(
                    parameter_groups,
                    lr=LEARNING_RATE,
                    betas=BETAS,
                    fused=True,
                )

                use_fused = True

                print(
                    "[OK] Fused AdamW enabled."
                )

                return optimizer

            except Exception:

                pass

        # ----------------------------------------------------
        # STANDARD ADAMW FALLBACK
        # ----------------------------------------------------

        optimizer = torch.optim.AdamW(
            parameter_groups,
            lr=LEARNING_RATE,
            betas=BETAS,
        )

        if self.device.type == "cuda":

            print(
                "[INFO] Fused AdamW unavailable; "
                "using standard AdamW."
            )

        return optimizer


    # ========================================================
    # MODEL HELPERS
    # ========================================================

    def _get_uncompiled_model(self):

        if hasattr(
            self.model,
            "_orig_mod",
        ):

            return self.model._orig_mod

        return self.model


    # ========================================================
    # LEARNING RATE
    # ========================================================

    def _get_learning_rate(self, step):

        if step < WARMUP_STEPS:

            if WARMUP_STEPS <= 0:
                return LEARNING_RATE

            return (
                LEARNING_RATE
                * (step + 1)
                / WARMUP_STEPS
            )

        if MAX_STEPS <= WARMUP_STEPS:

            return MIN_LEARNING_RATE

        progress = (
            step - WARMUP_STEPS
        ) / (
            MAX_STEPS - WARMUP_STEPS
        )

        progress = min(
            max(progress, 0.0),
            1.0,
        )

        cosine = 0.5 * (
            1.0
            + math.cos(
                math.pi * progress
            )
        )

        return (
            MIN_LEARNING_RATE
            + cosine
            * (
                LEARNING_RATE
                - MIN_LEARNING_RATE
            )
        )


    # ========================================================
    # RNG STATE
    # ========================================================

    def _get_rng_state(self):

        state = {
            "torch": torch.get_rng_state()
        }

        if torch.cuda.is_available():

            state["cuda"] = (
                torch.cuda.get_rng_state_all()
            )

        return state


    def _restore_rng_state(self, state):

        if not state:
            return

        try:

            if "torch" in state:

                torch.set_rng_state(
                    state["torch"]
                )

            if (
                torch.cuda.is_available()
                and "cuda" in state
            ):

                torch.cuda.set_rng_state_all(
                    state["cuda"]
                )

        except Exception as exc:

            print(
                "[WARN] Could not restore RNG state:"
            )

            print(
                f"       {exc}"
            )


    # ========================================================
    # GPU MEMORY
    # ========================================================

    def _gpu_memory(self):

        if not torch.cuda.is_available():
            return None

        try:

            allocated = (
                torch.cuda.memory_allocated()
                / 1024**3
            )

            reserved = (
                torch.cuda.memory_reserved()
                / 1024**3
            )

            return allocated, reserved

        except Exception:

            return None


    # ========================================================
    # CHECKPOINT SAVE
    # ========================================================

    def save_checkpoint(
        self,
        path=LATEST_CHECKPOINT,
    ):

        path = Path(path)

        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        model = self._get_uncompiled_model()

        checkpoint = {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "step": self.step,
            "best_loss": self.best_loss,
            "model_config": ModelConfig(),
            "scaler_state_dict": (
                self.scaler.state_dict()
                if self.scaler is not None
                else None
            ),
            "rng_state": self._get_rng_state(),
            "training_mode": self.training_mode,
            "training_files": [
                str(x)
                for x in self.training_files
            ],
            "vocab_size": VOCAB_SIZE,
        }

        temporary_path = path.with_suffix(
            path.suffix + ".tmp"
        )

        start = time.perf_counter()

        torch.save(
            checkpoint,
            temporary_path,
        )

        os.replace(
            temporary_path,
            path,
        )

        elapsed = (
            time.perf_counter()
            - start
        )

        print(
            f"[CHECKPOINT] Saved {path}"
            f" ({elapsed:.2f}s)"
        )


    # ========================================================
    # EMERGENCY CHECKPOINT
    # ========================================================

    def emergency_save(self):

        if self.shutdown_in_progress:
            return

        self.shutdown_in_progress = True

        print(
            "\n[CHECKPOINT] Emergency save..."
        )

        try:

            self.save_checkpoint(
                LATEST_CHECKPOINT
            )

            print(
                "[CHECKPOINT] Emergency checkpoint complete."
            )

        except Exception as exc:

            print(
                "[ERROR] Emergency checkpoint failed:"
            )

            print(
                f"        {exc}"
            )

        finally:

            self.shutdown_in_progress = False


    # ========================================================
    # LEGACY VOCAB MIGRATION
    # ========================================================

    def _migrate_optimizer_vocab(
        self,
        old_optimizer_state,
        old_vocab,
        new_vocab,
    ):

        if not old_optimizer_state:
            return

        if old_vocab >= new_vocab:
            return

        print(
            f"[INFO] Migrating optimizer vocabulary:"
            f" {old_vocab} -> {new_vocab}"
        )

        try:

            current_state = (
                self.optimizer.state_dict()
            )

            old_state = old_optimizer_state.get(
                "state",
                {}
            )

            new_state = current_state.get(
                "state",
                {}
            )

            # Parameter ordering is preserved by
            # the optimizer state dict.
            for param_id, old_entry in old_state.items():

                if param_id not in new_state:
                    continue

                new_entry = new_state[param_id]

                for key, old_value in old_entry.items():

                    if not torch.is_tensor(old_value):
                        new_entry[key] = old_value
                        continue

                    if (
                        old_value.ndim == 0
                        or old_value.shape[0] != old_vocab
                    ):

                        new_entry[key] = old_value
                        continue

                    new_shape = (
                        new_vocab,
                        *old_value.shape[1:],
                    )

                    new_tensor = torch.zeros(
                        new_shape,
                        dtype=old_value.dtype,
                        device=old_value.device,
                    )

                    copy_count = min(
                        old_vocab,
                        old_value.shape[0],
                    )

                    new_tensor[:copy_count].copy_(
                        old_value[:copy_count]
                    )

                    new_entry[key] = new_tensor

            self.optimizer.load_state_dict(
                current_state
            )

        except Exception as exc:

            print(
                "[WARN] Optimizer vocabulary migration "
                "failed."
            )

            print(
                f"       {exc}"
            )

            print(
                "[WARN] Model weights will still be preserved."
            )


    # ========================================================
    # CHECKPOINT LOAD
    # ========================================================

    def load_checkpoint(
        self,
        path=LATEST_CHECKPOINT,
    ):

        path = Path(path)

        if not path.exists():

            print(
                "[INFO] No checkpoint found."
            )

            return False

        print(
            f"[CHECKPOINT] Loading {path}..."
        )

        checkpoint = torch.load(
            path,
            map_location="cpu",
            weights_only=False,
        )

        checkpoint_mode = checkpoint.get(
            "training_mode"
        )

        if (
            checkpoint_mode
            and checkpoint_mode != self.training_mode
        ):

            print(
                "[WARN] Checkpoint training mode differs."
            )

            print(
                f"       checkpoint: {checkpoint_mode}"
            )

            print(
                f"       current:    {self.training_mode}"
            )

        state_dict = checkpoint.get(
            "model_state_dict"
        )

        if state_dict is None:

            state_dict = checkpoint.get(
                "state_dict"
            )

        if state_dict is None:

            state_dict = checkpoint.get(
                "model"
            )

        if state_dict is None:

            raise RuntimeError(
                "Checkpoint contains no model state."
            )

        # Remove DistributedDataParallel prefixes.
        cleaned_state_dict = {}

        for key, value in state_dict.items():

            if key.startswith("module."):
                key = key[7:]

            cleaned_state_dict[key] = value

        state_dict = cleaned_state_dict

        old_vocab = checkpoint.get(
            "vocab_size"
        )

        if old_vocab is None:

            old_embedding = state_dict.get(
                "token_embedding.weight"
            )

            if old_embedding is not None:

                old_vocab = old_embedding.shape[0]

            else:

                old_vocab = VOCAB_SIZE

        old_vocab = int(old_vocab)

        new_vocab = int(VOCAB_SIZE)

        model = self._get_uncompiled_model()

        # ----------------------------------------------------
        # NORMAL LOAD
        # ----------------------------------------------------

        if old_vocab == new_vocab:

            model.load_state_dict(
                state_dict,
                strict=True,
            )

            try:

                self.optimizer.load_state_dict(
                    checkpoint[
                        "optimizer_state_dict"
                    ]
                )

            except Exception as exc:

                print(
                    "[WARN] Optimizer state could not "
                    "be restored:"
                )

                print(
                    f"       {exc}"
                )

        # ----------------------------------------------------
        # VOCABULARY MIGRATION
        # ----------------------------------------------------

        elif old_vocab < new_vocab:

            print(
                f"[INFO] Vocabulary expansion detected:"
                f" {old_vocab} -> {new_vocab}"
            )

            # Import the existing migration helper.
            #
            # This keeps compatibility with the model's
            # established legacy vocabulary behavior.
            try:

                model.load_legacy_state_dict(
                    state_dict,
                    old_vocab=old_vocab,
                )

            except TypeError:

                model.load_legacy_state_dict(
                    state_dict,
                    old_vocab,
                    new_vocab,
                )

            except Exception as exc:

                raise RuntimeError(
                    "Legacy vocabulary migration failed."
                ) from exc

            old_optimizer_state = checkpoint.get(
                "optimizer_state_dict"
            )

            if old_optimizer_state:

                self._migrate_optimizer_vocab(
                    old_optimizer_state,
                    old_vocab,
                    new_vocab,
                )

            print(
                "[INFO] Vocabulary migration complete."
            )

        else:

            raise RuntimeError(
                "Checkpoint vocabulary is newer than "
                "the current model."
                f" checkpoint={old_vocab}"
                f" current={new_vocab}"
            )

        # ----------------------------------------------------
        # TRAINING STATE
        # ----------------------------------------------------

        self.step = int(
            checkpoint.get(
                "step",
                0,
            )
        )

        self.best_loss = float(
            checkpoint.get(
                "best_loss",
                float("inf"),
            )
        )

        # ----------------------------------------------------
        # GRAD SCALER
        # ----------------------------------------------------

        if (
            self.scaler is not None
            and checkpoint.get(
                "scaler_state_dict"
            )
        ):

            try:

                self.scaler.load_state_dict(
                    checkpoint[
                        "scaler_state_dict"
                    ]
                )

            except Exception as exc:

                print(
                    "[WARN] Could not restore GradScaler:"
                )

                print(
                    f"       {exc}"
                )

        # ----------------------------------------------------
        # RNG
        # ----------------------------------------------------

        self._restore_rng_state(
            checkpoint.get(
                "rng_state"
            )
        )

        print(
            f"[CHECKPOINT] Resumed at step {self.step:,}"
        )

        return True


    # ========================================================
    # BATCH FETCH
    # ========================================================

    def _next_batch(self):

        try:

            return next(
                self.loader_iterator
            )

        except StopIteration:

            self.loader_iterator = iter(
                self.loader
            )

            return next(
                self.loader_iterator
            )


    # ========================================================
    # MOVE BATCH
    # ========================================================

    def _move_batch_to_device(
        self,
        batch,
    ):

        input_ids = batch["input_ids"]

        labels = batch["labels"]

        if self.use_cuda:

            input_ids = input_ids.to(
                self.device,
                non_blocking=True,
            )

            labels = labels.to(
                self.device,
                non_blocking=True,
            )

        else:

            input_ids = input_ids.to(
                self.device
            )

            labels = labels.to(
                self.device
            )

        return input_ids, labels


    # ========================================================
    # AUTocast
    # ========================================================

    def _autocast_context(self):

        if not self.use_amp:

            return torch.autocast(
                device_type="cpu",
                enabled=False,
            )

        return torch.autocast(
            device_type="cuda",
            dtype=DTYPE,
            enabled=True,
        )


    # ========================================================
    # LOGGING
    # ========================================================

    def _print_progress(
        self,
        loss,
        grad_norm,
        step_seconds,
        tokens,
    ):

        if self.step != 1:

            if (
                self.step % LOG_INTERVAL != 0
                and not self.shutdown_requested
            ):

                return

        elapsed = (
            time.perf_counter()
            - self._training_start_time
        )

        if elapsed <= 0:
            elapsed = 1e-6

        total_steps = max(
            self.step,
            1,
        )

        steps_per_second = (
            total_steps / elapsed
        )

        tokens_per_second = (
            self._tokens_this_session
            / elapsed
        )

        remaining_steps = max(
            MAX_STEPS - self.step,
            0,
        )

        eta_seconds = (
            remaining_steps
            / max(
                steps_per_second,
                1e-9,
            )
        )

        hours = int(
            eta_seconds // 3600
        )

        minutes = int(
            (eta_seconds % 3600)
            // 60
        )

        seconds = int(
            eta_seconds % 60
        )

        lr = self.optimizer.param_groups[0]["lr"]

        speed_status = (
            "FAST"
            if step_seconds <= TARGET_SECONDS_PER_STEP
            else "SLOW"
        )

        memory = self._gpu_memory()

        memory_text = ""

        if memory is not None:

            allocated, reserved = memory

            memory_text = (
                f" | VRAM "
                f"{allocated:.2f}/"
                f"{reserved:.2f} GB"
            )

        progress = (
            self.step / max(MAX_STEPS, 1)
        ) * 100.0

        print(
            f"[{self.step:,}/{MAX_STEPS:,}] "
            f"{progress:6.2f}% | "
            f"loss {loss:.5f} | "
            f"grad {grad_norm:.3f} | "
            f"lr {lr:.3e} | "
            f"{step_seconds:.3f}s/step | "
            f"{tokens_per_second:,.0f} tok/s | "
            f"{speed_status} | "
            f"ETA {hours:02d}:{minutes:02d}:{seconds:02d}"
            f"{memory_text}"
        )


    # ========================================================
    # TRAIN
    # ========================================================

    def train(self):

        if self.step >= MAX_STEPS:

            print(
                "[INFO] MAX_STEPS already reached."
            )

            return

        session_start = self.step

        session_end = min(
            self.step + SESSION_STEPS,
            MAX_STEPS,
        )

        print()
        print("=" * 72)
        print(
            f"TRAINING SESSION "
            f"{session_start:,} -> {session_end:,}"
        )
        print("=" * 72)
        print()

        self.model.train()

        self._training_start_time = (
            time.perf_counter()
        )

        self._tokens_this_session = 0
        self._steps_this_session = 0

        try:

            while self.step < session_end:

                optimizer_step_start = (
                    time.perf_counter()
                )

                # ------------------------------------------------
                # ZERO GRADIENTS
                # ------------------------------------------------
                #
                # set_to_none=True avoids filling existing
                # gradient tensors with zeroes.
                #
                # This is faster and uses less memory traffic.

                self.optimizer.zero_grad(
                    set_to_none=True
                )

                accumulated_loss = 0.0

                total_tokens = 0

                # ------------------------------------------------
                # GRADIENT ACCUMULATION
                # ------------------------------------------------

                for micro_step in range(
                    GRADIENT_ACCUMULATION_STEPS
                ):

                    batch = self._next_batch()

                    input_ids, labels = (
                        self._move_batch_to_device(
                            batch
                        )
                    )

                    # ------------------------------------------------
                    # FORWARD
                    # ------------------------------------------------

                    with self._autocast_context():

                        _, loss = self.model(
                            input_ids,
                            labels,
                        )

                    # Keep a CPU-side scalar for logging
                    # without synchronizing the GPU every microstep.
                    accumulated_loss += float(
                        loss.detach()
                    )

                    scaled_loss = (
                        loss
                        / GRADIENT_ACCUMULATION_STEPS
                    )

                    # ------------------------------------------------
                    # BACKWARD
                    # ------------------------------------------------

                    if self.scaler is not None:

                        self.scaler.scale(
                            scaled_loss
                        ).backward()

                    else:

                        scaled_loss.backward()

                    # ------------------------------------------------
                    # TOKEN COUNT
                    # ------------------------------------------------

                    try:

                        total_tokens += int(
                            labels.numel()
                        )

                    except Exception:

                        pass

                # ------------------------------------------------
                # GRADIENT UN-SCALING
                # ------------------------------------------------

                if self.scaler is not None:

                    self.scaler.unscale_(
                        self.optimizer
                    )

                # ------------------------------------------------
                # GRADIENT CLIPPING
                # ------------------------------------------------

                grad_norm = torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    GRAD_CLIP,
                )

                # Convert only once per optimizer step.
                try:

                    grad_norm_value = float(
                        grad_norm
                    )

                except Exception:

                    grad_norm_value = 0.0

                # ------------------------------------------------
                # LEARNING RATE
                # ------------------------------------------------

                new_lr = self._get_learning_rate(
                    self.step
                )

                for group in self.optimizer.param_groups:

                    group["lr"] = new_lr

                # ------------------------------------------------
                # OPTIMIZER STEP
                # ------------------------------------------------

                if self.scaler is not None:

                    self.scaler.step(
                        self.optimizer
                    )

                    self.scaler.update()

                else:

                    self.optimizer.step()

                # ------------------------------------------------
                # UPDATE STEP
                # ------------------------------------------------

                self.step += 1

                self._steps_this_session += 1

                self._tokens_this_session += (
                    total_tokens
                )

                # ------------------------------------------------
                # TIMING
                # ------------------------------------------------

                step_seconds = (
                    time.perf_counter()
                    - optimizer_step_start
                )

                average_loss = (
                    accumulated_loss
                    / GRADIENT_ACCUMULATION_STEPS
                )

                self._last_loss = average_loss

                self._last_grad_norm = (
                    grad_norm_value
                )

                # ------------------------------------------------
                # PROGRESS
                # ------------------------------------------------

                self._print_progress(
                    average_loss,
                    grad_norm_value,
                    step_seconds,
                    total_tokens,
                )

                # ------------------------------------------------
                # VALIDATION
                # ------------------------------------------------

                if (
                    VALIDATION_INTERVAL > 0
                    and self.step % VALIDATION_INTERVAL == 0
                ):

                    print()
                    print(
                        f"[VALIDATION] Step {self.step:,}"
                    )

                    validation_start = (
                        time.perf_counter()
                    )

                    try:

                        validation_loss = evaluate(
                            self.model,
                            self.tokenizer,
                        )

                        validation_time = (
                            time.perf_counter()
                            - validation_start
                        )

                        print(
                            f"[VALIDATION] "
                            f"loss={validation_loss:.5f} "
                            f"({validation_time:.2f}s)"
                        )

                        if (
                            validation_loss
                            < self.best_loss
                        ):

                            self.best_loss = (
                                validation_loss
                            )

                            print(
                                "[VALIDATION] "
                                "New best model."
                            )

                            self.save_checkpoint(
                                BEST_CHECKPOINT
                            )

                    except Exception as exc:

                        print(
                            "[WARN] Validation failed:"
                        )

                        print(
                            f"       {exc}"
                        )

                    self.model.train()

                # ------------------------------------------------
                # NORMAL CHECKPOINT
                # ------------------------------------------------

                if (
                    CHECKPOINT_INTERVAL > 0
                    and self.step % CHECKPOINT_INTERVAL == 0
                ):

                    self.save_checkpoint(
                        LATEST_CHECKPOINT
                    )

                # ------------------------------------------------
                # SAFETY CHECKPOINT
                # ------------------------------------------------
                #
                # This protects long runs without forcing
                # enormous model writes every few steps.

                elif (
                    SAFETY_CHECKPOINT_INTERVAL > 0
                    and self.step % SAFETY_CHECKPOINT_INTERVAL == 0
                ):

                    self.save_checkpoint(
                        LATEST_CHECKPOINT
                    )

                # ------------------------------------------------
                # USER REQUESTED STOP
                # ------------------------------------------------

                if self.shutdown_requested:

                    print(
                        "[STOP] Saving checkpoint..."
                    )

                    self.emergency_save()

                    return

        except KeyboardInterrupt:

            print(
                "\n[STOP] Keyboard interrupt."
            )

            self.emergency_save()

            return

        except Exception as exc:

            print()
            print(
                "[ERROR] Training crashed:"
            )

            print(
                f"        {exc}"
            )

            print(
                "[CHECKPOINT] Attempting emergency save..."
            )

            self.emergency_save()

            raise

        # ========================================================
        # SESSION COMPLETE
        # ========================================================

        print()
        print("=" * 72)
        print(
            f"SESSION COMPLETE: "
            f"{session_start:,} -> {self.step:,}"
        )
        print("=" * 72)

        # --------------------------------------------------------
        # SAVE LATEST CHECKPOINT
        # --------------------------------------------------------

        self.save_checkpoint(
            LATEST_CHECKPOINT
        )

        # --------------------------------------------------------
        # SAVE FINAL MODEL
        # --------------------------------------------------------

        model = self._get_uncompiled_model()

        final_path = Path(
            FINAL_MODEL
        )

        final_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        print(
            f"[MODEL] Saving final model to {final_path}..."
        )

        torch.save(
            model.state_dict(),
            final_path,
        )

        # --------------------------------------------------------
        # SESSION METRICS
        # --------------------------------------------------------

        elapsed = (
            time.perf_counter()
            - self._training_start_time
        )

        if elapsed > 0:

            steps_per_second = (
                self._steps_this_session
                / elapsed
            )

            tokens_per_second = (
                self._tokens_this_session
                / elapsed
            )

        else:

            steps_per_second = 0.0
            tokens_per_second = 0.0

        print()
        print(
            f"[INFO] Session steps: "
            f"{self._steps_this_session:,}"
        )

        print(
            f"[INFO] Session time: "
            f"{elapsed:.2f}s"
        )

        print(
            f"[INFO] Steps/sec: "
            f"{steps_per_second:.4f}"
        )

        print(
            f"[INFO] Tokens/sec: "
            f"{tokens_per_second:,.0f}"
        )

        print(
            f"[INFO] Final training loss: "
            f"{self._last_loss:.5f}"
        )

        print(
            f"[INFO] Best validation loss: "
            f"{self.best_loss:.5f}"
        )

        print()
        print(
            "[DONE] Training session finished."
        )


    # ========================================================
    # STARTUP INFORMATION
    # ========================================================

    def _print_startup_info(self):

        model = self._get_uncompiled_model()

        parameter_count = sum(
            parameter.numel()
            for parameter in model.parameters()
        )

        parameter_count_m = (
            parameter_count / 1_000_000
        )

        effective_batch = (
            BATCH_SIZE
            * GRADIENT_ACCUMULATION_STEPS
        )

        tokens_per_optimizer_step = (
            BATCH_SIZE
            * GRADIENT_ACCUMULATION_STEPS
            * MAX_SEQ_LEN
        )

        print()
        print("=" * 72)
        print("SHREKAI TRAINER")
        print("=" * 72)

        print(
            f"Mode:                 {self.training_mode}"
        )

        print(
            f"Device:               {self.device}"
        )

        print(
            f"Parameters:           {parameter_count_m:.2f}M"
        )

        print(
            f"Vocabulary:           {VOCAB_SIZE}"
        )

        print(
            f"Base vocabulary:      {BASE_VOCAB_SIZE}"
        )

        print(
            f"Sequence length:      {MAX_SEQ_LEN}"
        )

        print(
            f"Batch size:           {BATCH_SIZE}"
        )

        print(
            f"Gradient accumulation:{GRADIENT_ACCUMULATION_STEPS}"
        )

        print(
            f"Effective batch:      {effective_batch}"
        )

        print(
            f"Tokens/optimizer:     "
            f"{tokens_per_optimizer_step:,}"
        )

        print(
            f"Learning rate:        {LEARNING_RATE:.3e}"
        )

        print(
            f"Minimum LR:           {MIN_LEARNING_RATE:.3e}"
        )

        print(
            f"Weight decay:         {WEIGHT_DECAY:.3e}"
        )

        print(
            f"Max steps:            {MAX_STEPS:,}"
        )

        print(
            f"Session steps:        {SESSION_STEPS:,}"
        )

        print(
            f"Workers:              {NUM_WORKERS}"
        )

        print(
            f"Prefetch:              "
            f"{4 if NUM_WORKERS > 0 else 0}"
        )

        print(
            f"AMP:                  {self.use_amp}"
        )

        print(
            f"GradScaler:            "
            f"{self.scaler is not None}"
        )

        print(
            f"torch.compile:        {self.compiled}"
        )

        print(
            f"Log interval:         {LOG_INTERVAL}"
        )

        print(
            f"Safety checkpoint:    "
            f"{SAFETY_CHECKPOINT_INTERVAL}"
        )

        print(
            f"Validation interval:  "
            f"{VALIDATION_INTERVAL}"
        )

        print(
            f"Checkpoint interval:  "
            f"{CHECKPOINT_INTERVAL}"
        )

        print()

        print(
            f"Dataset examples:     "
            f"{len(self.dataset):,}"
        )

        print(
            f"Loader batches/epoch: "
            f"{len(self.loader):,}"
        )

        print()

        if torch.cuda.is_available():

            try:

                gpu_name = (
                    torch.cuda.get_device_name(
                        self.device
                    )
                )

                print(
                    f"GPU:                  {gpu_name}"
                )

                memory_gb = (
                    torch.cuda.get_device_properties(
                        self.device
                    ).total_memory
                    / 1024**3
                )

                print(
                    f"GPU VRAM:             "
                    f"{memory_gb:.2f} GB"
                )

            except Exception:
                pass

        print("=" * 72)
        print()