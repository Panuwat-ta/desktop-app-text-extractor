@echo off
echo ========================================
echo Building Text Extractor Full Installer
echo ========================================
echo.

REM Step 1: Build app (unpacked only)
echo [1/2] Building application...
call .\build-simple.bat
if errorlevel 1 (
    echo Error: Failed to build app
    pause
    exit /b 1
)

echo.
echo [2/2] Creating full installer with NSIS...
"C:\Program Files (x86)\NSIS\makensis.exe" full-installer.nsi

if errorlevel 1 (
    echo Error: Failed to create installer
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build complete!
echo ========================================
echo.
echo Installer: Text Extractor Setup 1.4.2.exe
echo.
echo This installer will:
echo 1. Install the application
echo 2. Check for Python and download/install if needed
echo 3. Download and install PyTorch
echo 4. Download and install Surya OCR
echo 5. Download AI models (~620 MB)
echo 6. Wait until everything is complete
echo 7. Show "Installation Complete" when done
echo.
echo Total installation time: 10-15 minutes
echo Requires: Internet connection
echo.
pause
