@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo [1/5] Creating Python environment...
  py -3.13 -m venv .venv
  if errorlevel 1 py -3 -m venv .venv
  if errorlevel 1 (
    echo Could not create the Python environment. Install Python 3.11-3.13 and try again.
    exit /b 1
  )
)
set "PY=%CD%\.venv\Scripts\python.exe"
echo [2/5] Updating pip...
"%PY%" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
echo [3/5] Installing ShrekAI training dependencies...
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
echo [4/5] Downloading the Qwen3 base model...
"%PY%" -c "from transformers import AutoTokenizer,AutoModelForCausalLM; m='Qwen/Qwen3-0.6B'; AutoTokenizer.from_pretrained(m); AutoModelForCausalLM.from_pretrained(m,low_cpu_mem_usage=True); print('Base model downloaded.')"
if errorlevel 1 exit /b 1
echo [5/5] Importing English datasets...
"%PY%" prepare_data.py
if errorlevel 1 exit /b 1
if /i "%~1"=="--prepare-only" (
  echo Setup and dataset import complete. Training was not started.
  exit /b 0
)
echo Starting ShrekAI LoRA training. This can take a long time on a 2 GB GPU or CPU.
"%PY%" train.py
if errorlevel 1 (
  echo Training did not complete. See the error above. Your base model and imported data are preserved.
  exit /b 1
)
echo Training finished. Run chat.bat to talk to ShrekAI.
