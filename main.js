const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const fsPromises = fs.promises;
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');

let mainWindow;
let suryaProcess = null;
let tray = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });
}

// Window state management
const Store = require('electron-store');
const store = new Store();

function createWindow() {
  // Get screen size
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Load saved window state or use defaults (80% of screen size)
  const defaultWidth = Math.min(1200, Math.floor(screenWidth * 0.8));
  const defaultHeight = Math.min(800, Math.floor(screenHeight * 0.8));
  
  const windowState = store.get('windowState', {
    width: defaultWidth,
    height: defaultHeight,
    x: undefined,
    y: undefined,
    isMaximized: false
  });
  
  // Ensure window fits on screen
  if (windowState.width > screenWidth) windowState.width = defaultWidth;
  if (windowState.height > screenHeight) windowState.height = defaultHeight;
  
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 640,
    minHeight: 480,
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Text Extractor',
    show: false,
  });

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development or when ELECTRON_DEBUG is set
  if (!app.isPackaged || process.env.ELECTRON_DEBUG) {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Save window state on resize/move
  const saveWindowState = () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    store.set('windowState', {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    });
  };
  
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);
  
  mainWindow.on('closed', () => { 
    mainWindow = null;
    // Server will be stopped when app quits
  });
  
  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on first minimize
      if (!store.get('trayNotificationShown')) {
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'Text Extractor',
            body: 'แอปยังทำงานอยู่ในถาดระบบ คลิกขวาที่ไอคอนเพื่อเปิดหรือปิดแอป',
            icon: path.join(__dirname, 'favicon.ico')
          });
          notification.show();
        }
        store.set('trayNotificationShown', true);
      }
    }
  });
}

app.whenReady().then(() => {
  // Set app user model ID for Windows notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('Text Extractor');
  }
  
  createWindow();
  createTray();
  
  // Log startup info
  console.log('='.repeat(60));
  console.log('Text Extractor Starting...');
  console.log('App version:', app.getVersion());
  console.log('Electron version:', process.versions.electron);
  console.log('Node version:', process.versions.node);
  console.log('Platform:', process.platform);
  console.log('Is packaged:', app.isPackaged);
  console.log('App path:', app.getAppPath());
  console.log('Resources path:', process.resourcesPath);
  console.log('User data:', app.getPath('userData'));
  console.log('='.repeat(60));
  
  // Start Surya server only once
  if (!suryaProcess) {
    startSuryaServer();
  }
});

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed, keep running in tray
  // Only quit on macOS if explicitly requested
  if (process.platform === 'darwin' && app.isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('will-quit', () => {
  console.log('App is quitting, stopping Surya server...');
  stopSuryaServer();
});

app.on('before-quit', () => {
  console.log('Before quit event triggered');
  app.isQuitting = true;
});

function createTray() {
  // Create tray icon
  const iconPath = path.join(__dirname, 'favicon.ico');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Text Extractor');
  
  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'เปิด Text Extractor',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'ปิดแอป',
      click: () => {
        console.log('Quit button clicked from tray menu');
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Double click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function startSuryaServer() {
  // Don't start if already running
  if (suryaProcess) {
    console.log('Surya server already running');
    return;
  }
  
  try {
    // Try to find Python in common locations
    let pythonPath = 'python';
    
    // Determine the correct path for surya_server.py
    let serverPath;
    let workingDir;
    
    if (app.isPackaged) {
      // In production (packaged app)
      // The installer copies files to resources folder
      const possiblePaths = [
        {
          // First try: resources folder (for Inno Setup installer)
          server: path.join(process.resourcesPath, 'surya_server.py'),
          working: process.resourcesPath
        },
        {
          // Second try: Same directory as exe
          server: path.join(path.dirname(app.getPath('exe')), 'surya_server.py'),
          working: path.dirname(app.getPath('exe'))
        },
        {
          // Third try: app.asar.unpacked
          server: path.join(process.resourcesPath, 'app.asar.unpacked', 'surya_server.py'),
          working: path.join(process.resourcesPath, 'app.asar.unpacked')
        }
      ];
      
      // Find the first path that exists
      for (const p of possiblePaths) {
        if (fs.existsSync(p.server)) {
          serverPath = p.server;
          workingDir = p.working;
          break;
        }
      }
    } else {
      // In development, use app path
      serverPath = path.join(app.getAppPath(), 'surya_server.py');
      workingDir = app.getAppPath();
    }
    
    console.log('='.repeat(50));
    console.log('Starting Surya OCR server...');
    console.log('Python path:', pythonPath);
    console.log('Server path:', serverPath);
    console.log('Working directory:', workingDir);
    console.log('Is packaged:', app.isPackaged);
    console.log('Resources path:', process.resourcesPath);
    console.log('App path:', app.getAppPath());
    console.log('Exe path:', app.getPath('exe'));
    console.log('Exe dir:', path.dirname(app.getPath('exe')));
    
    // Check if file exists
    if (!serverPath || !fs.existsSync(serverPath)) {
      console.error('❌ Surya server file not found!');
      console.error('Tried paths:');
      if (app.isPackaged) {
        console.error('  1.', path.join(process.resourcesPath, 'surya_server.py'), '(resources folder)');
        console.error('  2.', path.join(path.dirname(app.getPath('exe')), 'surya_server.py'), '(exe directory)');
        console.error('  3.', path.join(process.resourcesPath, 'app.asar.unpacked', 'surya_server.py'), '(asar unpacked)');
      } else {
        console.error('  -', path.join(app.getAppPath(), 'surya_server.py'));
      }
      return;
    }
    
    console.log('✅ Server file found');
    
    // Check if requirements.txt exists
    const requirementsPath = path.join(workingDir, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      console.log('✅ requirements.txt found');
    } else {
      console.error('⚠️  requirements.txt not found at:', requirementsPath);
    }
    
    // Set environment variables for model cache
    // Models are stored at the installation root (same level as exe)
    const installDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
    const modelCacheDir = path.join(installDir, 'surya_models');
    
    const env = {
      ...process.env,
      HF_HOME: modelCacheDir,
      TRANSFORMERS_CACHE: modelCacheDir,
      HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
      PYTHONUNBUFFERED: '1' // Ensure Python output is not buffered
    };
    
    console.log('Model cache directory:', modelCacheDir);
    console.log('Model cache exists:', fs.existsSync(modelCacheDir));
    console.log('='.repeat(50));
    
    // Use quotes around paths to handle spaces in directory names
    suryaProcess = spawn(pythonPath, [`"${serverPath}"`], {
      cwd: workingDir,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: true // Use shell to find Python in PATH
    });
    
    suryaProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log(`[Surya STDOUT] ${msg.trim()}`);
    });
    
    suryaProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      // Flask warnings and access logs are sent to stderr, but they're not actual errors
      if (errorMsg.includes('WARNING') || 
          errorMsg.includes('Running on') || 
          errorMsg.includes('Press CTRL+C') ||
          errorMsg.includes('GET /health') ||
          errorMsg.includes('POST /ocr') ||
          errorMsg.includes('FutureWarning') ||
          errorMsg.match(/\d+\.\d+\.\d+\.\d+ - -/)) {
        // These are normal Flask messages, log as info
        console.log(`[Surya INFO] ${errorMsg.trim()}`);
      } else {
        console.error(`[Surya ERROR] ${errorMsg.trim()}`);
        
        // Check for common errors
        if (errorMsg.includes('ModuleNotFoundError') || errorMsg.includes('No module named')) {
          console.error('\n⚠️  Python dependencies not installed!');
          console.error('Missing module detected. Please check installation.');
        }
        if (errorMsg.includes('python') && errorMsg.includes('not found')) {
          console.error('\n⚠️  Python not found in PATH!');
        }
      }
    });
    
    suryaProcess.on('close', (code) => {
      console.log(`Surya server exited with code ${code}`);
      suryaProcess = null;
      
      if (code !== 0 && code !== null) {
        console.error('⚠️  Surya server stopped unexpectedly');
      }
    });
    
    suryaProcess.on('error', (err) => {
      console.error('❌ Failed to start Surya server:', err);
      if (err.code === 'ENOENT') {
        console.error('\n⚠️  Python not found!');
        console.error('Please ensure Python is installed and in PATH');
      }
      suryaProcess = null;
    });
    
    console.log('✅ Surya server process started (PID:', suryaProcess.pid, ')');
    
  } catch (error) {
    console.error('❌ Error starting Surya server:', error);
  }
}

function stopSuryaServer() {
  if (suryaProcess) {
    console.log('Stopping Surya OCR server...');
    try {
      // Try graceful shutdown first
      if (process.platform === 'win32') {
        // On Windows, use taskkill to ensure process and children are killed
        const { execSync } = require('child_process');
        try {
          execSync(`taskkill /pid ${suryaProcess.pid} /T /F`, { stdio: 'ignore' });
          console.log('✅ Surya server stopped (taskkill)');
        } catch (e) {
          // Process might already be dead
          console.log('⚠️  Process already stopped or not found');
        }
      } else {
        // On Unix-like systems, send SIGTERM
        suryaProcess.kill('SIGTERM');
        console.log('✅ Surya server stopped (SIGTERM)');
      }
    } catch (error) {
      console.error('Error stopping Surya server:', error);
      // Force kill as fallback
      try {
        suryaProcess.kill('SIGKILL');
        console.log('✅ Surya server force stopped (SIGKILL)');
      } catch (e) {
        console.error('Failed to force kill:', e);
      }
    }
    suryaProcess = null;
  } else {
    console.log('No Surya server process to stop');
  }
}

ipcMain.handle('app:getTesseractWorkerPath', () => {
  const workerPath = path.join(app.getAppPath(), 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  return pathToFileURL(workerPath).href;
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'ภาพและ PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf'] },
      { name: 'ภาพ', extensions: ['jpg', 'jpeg', 'png'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'ทั้งหมด', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle('file:readAsBuffer', async (_, filePath) => {
  const buffer = await fsPromises.readFile(filePath);
  return buffer;
});

ipcMain.handle('file:readAsText', async (_, filePath) => {
  const text = await fsPromises.readFile(filePath, 'utf-8');
  return text;
});

ipcMain.handle('pdf:extractFromPath', async (_, filePath) => {
  const buffer = await fsPromises.readFile(filePath);
  const data = await pdfParse(buffer);
  return { text: data.text, pages: data.numpages };
});

ipcMain.handle('pdf:extractFromBuffer', async (_, buffer) => {
  const data = await pdfParse(Buffer.from(buffer));
  return { text: data.text, pages: data.numpages };
});

ipcMain.handle('dialog:saveFile', async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'extracted.txt',
    filters: [{ name: 'ข้อความ', extensions: ['txt'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:writeText', async (_, filePath, text) => {
  await fsPromises.writeFile(filePath, text, 'utf-8');
});

ipcMain.handle('surya:checkAvailable', async () => {
  return suryaProcess !== null;
});

ipcMain.handle('surya:restart', async () => {
  stopSuryaServer();
  await new Promise(resolve => setTimeout(resolve, 1000));
  startSuryaServer();
  await new Promise(resolve => setTimeout(resolve, 3000));
  return suryaProcess !== null;
});

// Show notification
ipcMain.handle('notification:show', async (_, options) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: options.title || 'Text Extractor',
      body: options.body || '',
      icon: path.join(__dirname, 'favicon.ico'),
      silent: options.silent || false,
      urgency: options.urgency || 'normal' // low, normal, critical
    });
    
    notification.show();
    
    // Handle click
    if (options.onClick) {
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
    }
    
    return true;
  }
  return false;
});
