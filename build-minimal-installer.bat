@echo off
echo ========================================
echo Building Minimal Installer
echo ========================================
echo.

REM Kill processes
taskkill /F /IM "Text-Extractor.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul
timeout /t 2 /nobreak >nul

REM Clean
if exist dist rmdir /s /q dist
if exist dist-minimal rmdir /s /q dist-minimal

REM Step 1: Build Electron app first
echo [1/3] Building Electron app...
call npm run build:win -- --dir
if errorlevel 1 (
    echo Error: Failed to build Electron app
    pause
    exit /b 1
)

REM Step 2: Create minimal package (copy only necessary files)
echo.
echo [2/3] Creating minimal package...
mkdir dist-minimal

REM Copy built app
xcopy "dist\win-unpacked\*" "dist-minimal\" /E /I /Y

REM Copy additional files
copy "requirements.txt" "dist-minimal\"
copy "surya_server.py" "dist-minimal\"

echo.
echo [3/3] Creating installer...

if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer-minimal.iss
) else (
    echo ERROR: Inno Setup not found!
    pause
    exit /b 1
)

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
echo Installer: Text-Extractor-Setup-1.4.2.exe
echo.
echo During installation, it will:
echo 1. Install the application
echo 2. Check and install Python if needed
echo 3. Install Surya OCR and dependencies
echo 4. Download AI models
echo 5. Show progress for each step
echo.
pause

