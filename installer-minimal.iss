; Minimal Inno Setup Script for Text-Extractor
; Downloads everything from internet during installation

#define MyAppName "Text-Extractor"
#define MyAppVersion "1.4.2"
#define MyAppPublisher "Panuwat-ta"
#define MyAppURL "https://github.com/Panuwat-ta/desktop-app-text-extractor"
#define MyAppExeName "Text-Extractor.exe"
#define PythonVersion "3.11.8"
#define PythonURL "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe"

[Setup]
AppId={{F5440DE6-BA7B-5A29-8D34-4E88B2755221}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=LICENSE.txt
OutputDir=.
OutputBaseFilename=Text-Extractor-Setup-{#MyAppVersion}
SetupIconFile=favicon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist-minimal\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Launch the app after installation is complete
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DownloadPage: TDownloadWizardPage;
  PythonInstalled: Boolean;
  PythonPath: String;
  InstallLogMemo: TMemo;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded %s', [FileName]));
  Result := True;
end;

procedure AddInstallLog(const Message: String);
begin
  if InstallLogMemo <> nil then
  begin
    InstallLogMemo.Lines.Add(Message);
    // Auto-scroll to bottom
    InstallLogMemo.SelStart := Length(InstallLogMemo.Text);
    InstallLogMemo.SelLength := 0;
  end;
  Log(Message);
end;

procedure AddInstallLogSeparator();
begin
  if InstallLogMemo <> nil then
  begin
    InstallLogMemo.Lines.Add('─────────────────────────────────────────────────────────────');
  end;
end;

function CheckPython(): Boolean;
var
  ResultCode: Integer;
  VersionOutput: AnsiString;
begin
  Result := False;
  PythonPath := '';
  
  AddInstallLog('🔍 Checking for Python installation...');
  
  if Exec('cmd.exe', '/c python --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      Result := True;
      PythonPath := 'python';
      AddInstallLog('✓ Python found: python.exe');
      Exit;
    end;
  end;
  
  if Exec('cmd.exe', '/c python3 --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      Result := True;
      PythonPath := 'python3';
      AddInstallLog('✓ Python found: python3.exe');
      Exit;
    end;
  end;
  
  AddInstallLog('⚠ Python not found - will install Python {#PythonVersion}');
end;

procedure InstallPython();
var
  ResultCode: Integer;
  PythonInstaller: String;
begin
  PythonInstaller := ExpandConstant('{tmp}\python-installer.exe');
  
  AddInstallLogSeparator();
  AddInstallLog('📥 Downloading Python {#PythonVersion}...');
  AddInstallLog('   Source: python.org');
  AddInstallLog('   Size: ~30 MB');
  
  DownloadPage.Clear;
  DownloadPage.Add('{#PythonURL}', PythonInstaller, '');
  DownloadPage.Show;
  
  try
    DownloadPage.Download;
    AddInstallLog('✓ Python installer downloaded successfully');
    AddInstallLog('');
    AddInstallLog('⚙ Installing Python {#PythonVersion}...');
    AddInstallLog('   This may take 2-3 minutes');
    AddInstallLog('   Installing for all users with pip');
    
    if Exec(PythonInstaller, '/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
      begin
        AddInstallLog('✓ Python installed successfully');
        AddInstallLog('   Location: C:\Program Files\Python311');
        PythonInstalled := True;
        PythonPath := 'python';
        Sleep(2000);
      end
      else
      begin
        AddInstallLog('✗ Python installation failed');
        AddInstallLog('   Error code: ' + IntToStr(ResultCode));
      end;
    end;
  finally
    DownloadPage.Hide;
  end;
  AddInstallLogSeparator();
end;

procedure InstallSuryaDependencies();
var
  ResultCode: Integer;
  InstallDir: String;
  EnvCmd: String;
  TorchInstalled: Boolean;
  SuryaInstalled: Boolean;
  ModelsDownloaded: Boolean;
begin
  InstallDir := ExpandConstant('{app}');
  
  AddInstallLogSeparator();
  AddInstallLog('🔍 Checking installed dependencies...');
  
  // Update status message
  WizardForm.StatusLabel.Caption := 'Checking dependencies...';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  
  // Check if PyTorch is installed
  TorchInstalled := False;
  AddInstallLog('   → Checking PyTorch...');
  if Exec('cmd.exe', '/c ' + PythonPath + ' -c "import torch; print(torch.__version__)" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      TorchInstalled := True;
      AddInstallLog('   ✓ PyTorch already installed');
    end
    else
    begin
      AddInstallLog('   ⚠ PyTorch not found');
    end;
  end;
  
  // Check if Surya OCR is installed
  SuryaInstalled := False;
  AddInstallLog('   → Checking Surya OCR...');
  if Exec('cmd.exe', '/c ' + PythonPath + ' -c "import surya; print(surya.__version__)" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      SuryaInstalled := True;
      AddInstallLog('   ✓ Surya OCR already installed');
    end
    else
    begin
      AddInstallLog('   ⚠ Surya OCR not found');
    end;
  end;
  
  // Check if models are downloaded
  ModelsDownloaded := False;
  AddInstallLog('   → Checking AI models...');
  if DirExists(InstallDir + '\surya_models\models--vikp--surya_det2') and 
     DirExists(InstallDir + '\surya_models\models--vikp--surya_rec') then
  begin
    ModelsDownloaded := True;
    AddInstallLog('   ✓ AI models already downloaded');
  end
  else
  begin
    AddInstallLog('   ⚠ AI models not found');
  end;
  
  CreateDir(InstallDir + '\surya_models');
  EnvCmd := 'set HF_HOME=' + InstallDir + '\surya_models && set TRANSFORMERS_CACHE=' + InstallDir + '\surya_models && set HF_HUB_DISABLE_SYMLINKS_WARNING=1 && ';
  
  // Step 1: Update pip
  AddInstallLogSeparator();
  AddInstallLog('📦 [1/4] Updating pip package manager...');
  WizardForm.StatusLabel.Caption := '[1/4] Updating pip...';
  Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install --upgrade pip >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode = 0 then
    AddInstallLog('✓ pip updated to latest version')
  else
    AddInstallLog('⚠ pip update completed with warnings');
  
  // Step 2: Install PyTorch
  AddInstallLogSeparator();
  if TorchInstalled then
  begin
    AddInstallLog('⏭ [2/4] PyTorch already installed - skipping');
    WizardForm.StatusLabel.Caption := '[2/4] PyTorch already installed - skipping...';
    Sleep(1000);
  end
  else
  begin
    AddInstallLog('📥 [2/4] Installing PyTorch...');
    AddInstallLog('   This is a large package (~2 GB)');
    AddInstallLog('   Download time: 5-10 minutes');
    AddInstallLog('   Trying CUDA version for GPU support...');
    WizardForm.StatusLabel.Caption := '[2/4] Installing PyTorch (this may take several minutes)...';
    
    if not Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118 >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      AddInstallLog('   ⚠ CUDA version failed, trying CPU version...');
      WizardForm.StatusLabel.Caption := '[2/4] Installing PyTorch (CPU version)...';
      Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install torch torchvision >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      AddInstallLog('✓ PyTorch (CPU) installed successfully');
    end
    else
    begin
      AddInstallLog('✓ PyTorch (CUDA) installed successfully');
      AddInstallLog('   GPU acceleration enabled!');
    end;
  end;
  
  // Step 3: Install Surya OCR
  AddInstallLogSeparator();
  if SuryaInstalled then
  begin
    AddInstallLog('⏭ [3/4] Surya OCR already installed - skipping');
    WizardForm.StatusLabel.Caption := '[3/4] Surya OCR already installed - skipping...';
    Sleep(1000);
  end
  else
  begin
    AddInstallLog('📥 [3/4] Installing Surya OCR...');
    AddInstallLog('   Installing from requirements.txt');
    AddInstallLog('   Packages: surya-ocr, pillow, flask, flask-cors');
    WizardForm.StatusLabel.Caption := '[3/4] Installing Surya OCR...';
    Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install -r "' + InstallDir + '\requirements.txt" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode = 0 then
      AddInstallLog('✓ Surya OCR installed successfully')
    else
      AddInstallLog('⚠ Surya OCR installation completed with warnings');
  end;
  
  // Step 4: Download AI models
  AddInstallLogSeparator();
  if ModelsDownloaded then
  begin
    AddInstallLog('⏭ [4/4] AI models already downloaded - skipping');
    WizardForm.StatusLabel.Caption := '[4/4] AI models already downloaded - skipping...';
    Sleep(1000);
  end
  else
  begin
    AddInstallLog('📥 [4/4] Downloading AI models...');
    AddInstallLog('   Total size: ~620 MB');
    AddInstallLog('   Estimated time: 5-10 minutes');
    AddInstallLog('   It depends on your internet connection speed');
    AddInstallLog('   Models will be cached for future use');
    AddInstallLog('');
    WizardForm.StatusLabel.Caption := '[4/4] Downloading AI models (~620 MB, this will take 5-10 minutes)...';
    
    AddInstallLog('   → Downloading Detection Model (vikp/surya_det2)...');
    AddInstallLog('     Size: ~300 MB');
    WizardForm.StatusLabel.Caption := '[4/4] Downloading Detection Model (vikp/surya_det2)...';
    
    if not Exec('cmd.exe', '/c ' + EnvCmd + PythonPath + ' -c "import os; os.environ[''HF_HOME'']=r''' + InstallDir + '\surya_models''; os.environ[''TRANSFORMERS_CACHE'']=r''' + InstallDir + '\surya_models''; os.environ[''HF_HUB_DISABLE_SYMLINKS_WARNING'']=''1''; print(''Loading models...''); from surya.model.detection.segformer import load_model as load_det; from surya.model.recognition.model import load_model as load_rec; print(''Loading detection model...''); load_det(); print(''Detection model loaded''); print(''Loading recognition model...''); load_rec(); print(''Recognition model loaded''); print(''Done'')"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      AddInstallLog('');
      AddInstallLog('✗ Failed to download models');
      AddInstallLog('   Error code: ' + IntToStr(ResultCode));
      AddInstallLog('   Please check:');
      AddInstallLog('   • Internet connection is stable');
      AddInstallLog('   • Firewall is not blocking downloads');
      AddInstallLog('   • Sufficient disk space (~1 GB free)');
      WizardForm.StatusLabel.Caption := '[4/4] Error downloading models (check internet connection)';
      Sleep(3000);
    end
    else
    begin
      AddInstallLog('   ✓ Detection Model downloaded');
      AddInstallLog('');
      AddInstallLog('   → Recognition Model (vikp/surya_rec)...');
      AddInstallLog('     Size: ~320 MB');
      AddInstallLog('   ✓ Recognition Model downloaded');
      AddInstallLog('');
      AddInstallLog('✓ All AI models downloaded successfully!');
      AddInstallLog('   Cache location: ' + InstallDir + '\surya_models');
      WizardForm.StatusLabel.Caption := '[4/4] AI models downloaded successfully!';
      Sleep(1000);
    end;
  end;
  
  AddInstallLogSeparator();
  AddInstallLog('');
  AddInstallLog('🎉 Installation completed successfully!');
  AddInstallLog('   Text-Extractor is ready to use');
  AddInstallLog('   All dependencies installed');
  AddInstallLog('   AI models cached and ready');
  AddInstallLog('');
  AddInstallLog('✅ You can now click Next to finish setup');
  AddInstallLog('');
  
  WizardForm.StatusLabel.Caption := 'Installation complete! Click Next to continue...';
  WizardForm.ProgressGauge.Style := npbstNormal;
  WizardForm.ProgressGauge.Position := WizardForm.ProgressGauge.Max;
  
  Sleep(1000);
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
  
    // Create a memo box to show installation details
    InstallLogMemo := TMemo.Create(WizardForm);
    InstallLogMemo.Parent := WizardForm.InstallingPage;

    // Margin ซ้าย-ขวา
    InstallLogMemo.Left := ScaleX(10);

    // ใต้ Progress bar
    InstallLogMemo.Top := WizardForm.ProgressGauge.Top +
                          WizardForm.ProgressGauge.Height +
                          ScaleY(15);
    // เต็มความกว้างแบบเว้นขอบ
    InstallLogMemo.Width :=
      WizardForm.InstallingPage.ClientWidth - ScaleX(20);
    // สูงจนถึงเหนือปุ่ม Cancel อัตโนมัติ
    InstallLogMemo.Height :=
      WizardForm.InstallingPage.ClientHeight
      - InstallLogMemo.Top
      - WizardForm.CancelButton.Height
      - ScaleY(20);
    InstallLogMemo.ScrollBars := ssVertical;
    InstallLogMemo.ReadOnly := True;
    InstallLogMemo.Color := $00FFE4CC;
    InstallLogMemo.Font.Name := 'Consolas';
    InstallLogMemo.Font.Size := 9;
    InstallLogMemo.Font.Color := $00000000;
  
  // Add header
  InstallLogMemo.Lines.Add('╔═══════════════════════════════════════════════════════════╗');
  InstallLogMemo.Lines.Add('║         Text-Extractor - Installation Log                 ║');
  InstallLogMemo.Lines.Add('╚═══════════════════════════════════════════════════════════╝');
  InstallLogMemo.Lines.Add('');
  AddInstallLog('Installation started');
  AddInstallLogSeparator();
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    // Check and install Python before copying files
    PythonInstalled := CheckPython();
    if not PythonInstalled then
    begin
      AddInstallLog('');
      AddInstallLog('⚙ Installing Python...');
      InstallPython();
    end
    else
    begin
      AddInstallLog('✓ Python already installed - skipping');
    end;
  end;
  
  if CurStep = ssPostInstall then
  begin
    // Install Surya OCR dependencies after files are copied
    // This runs in the Installing page, user cannot proceed until complete
    if PythonInstalled then
    begin
      AddInstallLogSeparator();
      AddInstallLog('');
      AddInstallLog('🚀 Starting Surya OCR installation...');
      AddInstallLog('   This process will:');
      AddInstallLog('   • Check existing dependencies');
      AddInstallLog('   • Install PyTorch (~2 GB)');
      AddInstallLog('   • Install Surya OCR');
      AddInstallLog('   • Download AI models (~620 MB)');
      AddInstallLog('');
      
      WizardForm.StatusLabel.Caption := 'กำลังติดตั้ง dependencies และดาวน์โหลด AI models...';
      WizardForm.ProgressGauge.Style := npbstMarquee;
      
      // This will block until complete - user cannot click Next/Finish
      InstallSuryaDependencies();
      
      WizardForm.StatusLabel.Caption := 'ติดตั้งเสร็จสมบูรณ์!';
      WizardForm.ProgressGauge.Style := npbstNormal;
      WizardForm.ProgressGauge.Position := WizardForm.ProgressGauge.Max;
      
      AddInstallLogSeparator();
      AddInstallLog('✓ All components installed successfully');
      AddInstallLog('✓ Text-Extractor is ready to use!');
      Sleep(2000);
    end;
  end;
end;
