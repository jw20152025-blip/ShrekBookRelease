@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run install_import_train.bat --prepare-only first.
  exit /b 1
)
".venv\Scripts\python.exe" prepare_data.py
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" train.py
