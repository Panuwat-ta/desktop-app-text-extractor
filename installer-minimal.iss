; Minimal Inno Setup Script for Text Extractor
; Downloads everything from internet during installation

#define MyAppName "Text Extractor"
#define MyAppVersion "1.4.2"
#define MyAppPublisher "Panuwat-ta"
#define MyAppURL "https://github.com/Panuwat-ta/desktop-app-text-extractor"
#define MyAppExeName "Text Extractor.exe"
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
OutputBaseFilename=Text Extractor Setup {#MyAppVersion}
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
; Don't run the app automatically after install (it needs dependencies first)
; Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DownloadPage: TDownloadWizardPage;
  PythonInstalled: Boolean;
  PythonPath: String;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded %s', [FileName]));
  Result := True;
end;

function CheckPython(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  PythonPath := '';
  
  if Exec('cmd.exe', '/c python --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      Result := True;
      PythonPath := 'python';
      Log('Found Python');
      Exit;
    end;
  end;
  
  if Exec('cmd.exe', '/c python3 --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      Result := True;
      PythonPath := 'python3';
      Log('Found Python');
      Exit;
    end;
  end;
  
  Log('Python not found');
end;

procedure InstallPython();
var
  ResultCode: Integer;
  PythonInstaller: String;
begin
  PythonInstaller := ExpandConstant('{tmp}\python-installer.exe');
  
  Log('Downloading Python...');
  DownloadPage.Clear;
  DownloadPage.Add('{#PythonURL}', PythonInstaller, '');
  DownloadPage.Show;
  
  try
    DownloadPage.Download;
    Log('Installing Python...');
    if Exec(PythonInstaller, '/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
      begin
        Log('Python installed');
        PythonInstalled := True;
        PythonPath := 'python';
        Sleep(3000);
      end;
    end;
  finally
    DownloadPage.Hide;
  end;
end;

procedure InstallSuryaDependencies();
var
  ResultCode: Integer;
  InstallDir: String;
  EnvCmd: String;
  StatusLabel: TNewStaticText;
  ProgressBar: TNewProgressBar;
begin
  InstallDir := ExpandConstant('{app}');
  
  // Create status window
  StatusLabel := TNewStaticText.Create(WizardForm);
  StatusLabel.Parent := WizardForm.FinishedPage;
  StatusLabel.Left := ScaleX(0);
  StatusLabel.Top := ScaleY(170);
  StatusLabel.Width := WizardForm.FinishedPage.Width;
  StatusLabel.Height := ScaleY(20);
  StatusLabel.Caption := 'Installing dependencies...';
  StatusLabel.Visible := True;
  
  ProgressBar := TNewProgressBar.Create(WizardForm);
  ProgressBar.Parent := WizardForm.FinishedPage;
  ProgressBar.Left := ScaleX(0);
  ProgressBar.Top := ScaleY(195);
  ProgressBar.Width := WizardForm.FinishedPage.Width;
  ProgressBar.Height := ScaleY(20);
  ProgressBar.Min := 0;
  ProgressBar.Max := 4;
  ProgressBar.Position := 0;
  ProgressBar.Visible := True;
  
  Log('Installing Surya OCR...');
  
  CreateDir(InstallDir + '\surya_models');
  EnvCmd := 'set HF_HOME=' + InstallDir + '\surya_models && set TRANSFORMERS_CACHE=' + InstallDir + '\surya_models && set HF_HUB_DISABLE_SYMLINKS_WARNING=1 && ';
  
  // Step 1
  StatusLabel.Caption := '[1/4] Updating pip...';
  WizardForm.Update;
  Log('[1/4] Updating pip...');
  Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install --upgrade pip', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  ProgressBar.Position := 1;
  WizardForm.Update;
  
  // Step 2
  StatusLabel.Caption := '[2/4] Installing PyTorch (this may take several minutes)...';
  WizardForm.Update;
  Log('[2/4] Installing PyTorch...');
  if not Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    StatusLabel.Caption := '[2/4] Installing PyTorch (CPU version)...';
    WizardForm.Update;
    Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install torch torchvision', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
  ProgressBar.Position := 2;
  WizardForm.Update;
  
  // Step 3
  StatusLabel.Caption := '[3/4] Installing Surya OCR...';
  WizardForm.Update;
  Log('[3/4] Installing Surya OCR...');
  Exec('cmd.exe', '/c ' + PythonPath + ' -m pip install -r "' + InstallDir + '\requirements.txt"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  ProgressBar.Position := 3;
  WizardForm.Update;
  
  // Step 4
  StatusLabel.Caption := '[4/4] Downloading AI models (~620 MB, this will take 5-10 minutes)...';
  WizardForm.Update;
  Log('[4/4] Downloading AI models...');
  Exec('cmd.exe', '/c ' + EnvCmd + PythonPath + ' -c "import os; os.environ[''HF_HOME'']=r''' + InstallDir + '\surya_models''; os.environ[''TRANSFORMERS_CACHE'']=r''' + InstallDir + '\surya_models''; os.environ[''HF_HUB_DISABLE_SYMLINKS_WARNING'']=''1''; from surya.model.detection.model import load_model as load_det; from surya.model.recognition.model import load_model as load_rec; load_det(); load_rec(); print(''Done'')"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  ProgressBar.Position := 4;
  WizardForm.Update;
  
  StatusLabel.Caption := 'Installation complete!';
  WizardForm.Update;
  
  Log('Surya OCR installation complete');
  
  // Clean up
  Sleep(1000);
  StatusLabel.Visible := False;
  ProgressBar.Visible := False;
  StatusLabel.Free;
  ProgressBar.Free;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  StatusLabel: TNewStaticText;
begin
  if CurStep = ssPostInstall then
  begin
    // Show installing message
    StatusLabel := TNewStaticText.Create(WizardForm);
    StatusLabel.Parent := WizardForm.FinishedPage;
    StatusLabel.Left := ScaleX(0);
    StatusLabel.Top := ScaleY(140);
    StatusLabel.Width := WizardForm.FinishedPage.Width;
    StatusLabel.Height := ScaleY(20);
    StatusLabel.Caption := 'Checking Python installation...';
    StatusLabel.Visible := True;
    WizardForm.Update;
    
    // Check and install Python
    PythonInstalled := CheckPython();
    if not PythonInstalled then
    begin
      StatusLabel.Caption := 'Python not found - downloading and installing...';
      WizardForm.Update;
      Log('Installing Python...');
      InstallPython();
    end
    else
    begin
      StatusLabel.Caption := 'Python already installed';
      WizardForm.Update;
      Log('Python already installed');
      Sleep(1000);
    end;
    
    StatusLabel.Free;
    
    // Install Surya OCR
    if PythonInstalled then
    begin
      Log('Installing Surya OCR...');
      InstallSuryaDependencies();
      
      MsgBox('Installation complete!' + #13#10 + #13#10 + 
             'Text Extractor is ready to use.' + #13#10 + #13#10 +
             'You can launch it from:' + #13#10 +
             '- Desktop shortcut' + #13#10 +
             '- Start menu', mbInformation, MB_OK);
    end
    else
    begin
      MsgBox('Python installation failed.' + #13#10 + #13#10 +
             'Please install Python manually from:' + #13#10 +
             'https://www.python.org' + #13#10 + #13#10 +
             'Then run: ' + ExpandConstant('{app}') + '\INSTALL_SURYA.bat', mbError, MB_OK);
    end;
  end;
end;
