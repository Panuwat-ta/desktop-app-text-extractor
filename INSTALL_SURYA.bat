@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════════════════════
echo   ติดตั้ง Surya OCR และ GPU Support
echo ═══════════════════════════════════════════════════════
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ไม่พบ Python!
    echo.
    echo กรุณาติดตั้ง Python 3.9+ จาก: https://www.python.org/downloads/
    echo ✓ เลือก "Add Python to PATH" ตอนติดตั้ง
    echo.
    pause
    exit /b 1
)

echo [OK] พบ Python แล้ว
python --version
echo.

REM Check for NVIDIA GPU
echo [1/4] ตรวจสอบ GPU...
nvidia-smi >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] พบ NVIDIA GPU
    nvidia-smi --query-gpu=name --format=csv,noheader
    set HAS_GPU=1
) else (
    echo [INFO] ไม่พบ NVIDIA GPU - จะติดตั้งแบบ CPU
    set HAS_GPU=0
)
echo.

REM Uninstall old PyTorch
echo [2/4] ถอนการติดตั้ง PyTorch เดิม (ถ้ามี)...
pip uninstall torch torchvision torchaudio -y >nul 2>&1
echo [OK] เสร็จแล้ว
echo.

REM Install PyTorch with CUDA or CPU
echo [3/4] กำลังติดตั้ง PyTorch...
if %HAS_GPU% EQU 1 (
    echo [GPU] ติดตั้ง PyTorch with CUDA 11.8
    echo [INFO] การติดตั้งจะใช้เวลา 5-10 นาที กรุณารอสักครู่...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
) else (
    echo [CPU] ติดตั้ง PyTorch แบบ CPU
    pip install torch torchvision torchaudio
)

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ติดตั้ง PyTorch ไม่สำเร็จ!
    pause
    exit /b 1
)
echo [OK] ติดตั้ง PyTorch สำเร็จ
echo.

REM Install other dependencies
echo [4/4] กำลังติดตั้ง Surya OCR และ dependencies อื่นๆ...
pip install flask flask-cors surya-ocr pillow

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ติดตั้ง dependencies ไม่สำเร็จ!
    pause
    exit /b 1
)
echo [OK] ติดตั้ง dependencies สำเร็จ
echo.

REM Test GPU
echo ═══════════════════════════════════════════════════════
echo   ทดสอบการติดตั้ง
echo ═══════════════════════════════════════════════════════
echo.
python -c "import torch; print('PyTorch version:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
echo.

echo ═══════════════════════════════════════════════════════
echo   ✓ ติดตั้งเสร็จสมบูรณ์!
echo ═══════════════════════════════════════════════════════
echo.

if %HAS_GPU% EQU 1 (
    python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ GPU พร้อมใช้งาน!
        echo    Surya OCR จะทำงานเร็วขึ้น 5-10 เท่า
    ) else (
        echo ⚠️  GPU ยังไม่พร้อมใช้งาน
        echo.
        echo เหตุผลที่เป็นไปได้:
        echo 1. NVIDIA Driver ไม่ได้ติดตั้งหรือเก่าเกินไป
        echo    → ดาวน์โหลดจาก: https://www.nvidia.com/download/index.aspx
        echo 2. ต้องรีสตาร์ทคอมพิวเตอร์
        echo.
        echo แอปจะใช้ CPU แทน (ช้ากว่า แต่ใช้งานได้)
    )
) else (
    echo ℹ️  ไม่พบ NVIDIA GPU
    echo    แอปจะใช้ CPU (ช้ากว่า แต่ใช้งานได้)
    echo.
    echo ถ้าต้องการใช้ GPU:
    echo 1. ติดตั้ง NVIDIA Driver
    echo 2. รันสคริปต์นี้อีกครั้ง
)

echo.
echo ตอนนี้สามารถเปิดแอปได้แล้ว: npm start
echo.
pause
