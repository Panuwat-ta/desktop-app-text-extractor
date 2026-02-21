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
    // Don't stop server when window closes
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
  createWindow();
  createTray();
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
  stopSuryaServer();
});

app.on('before-quit', () => {
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
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    
    // Determine the correct path for surya_server.py
    let serverPath;
    let workingDir;
    if (app.isPackaged) {
      // In production (packaged app), look in resources folder
      serverPath = path.join(process.resourcesPath, 'surya_server.py');
      workingDir = process.resourcesPath;
    } else {
      // In development, use app path
      serverPath = path.join(app.getAppPath(), 'surya_server.py');
      workingDir = app.getAppPath();
    }
    
    console.log('Starting Surya OCR server...');
    console.log('Python path:', pythonPath);
    console.log('Server path:', serverPath);
    console.log('Working directory:', workingDir);
    console.log('Is packaged:', app.isPackaged);
    
    // Check if file exists
    if (!fs.existsSync(serverPath)) {
      console.error('Surya server file not found:', serverPath);
      return;
    }
    
    // Set environment variables for model cache
    const modelCacheDir = path.join(workingDir, 'surya_models');
    const env = {
      ...process.env,
      HF_HOME: modelCacheDir,
      TRANSFORMERS_CACHE: modelCacheDir,
      HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
    };
    
    console.log('Model cache directory:', modelCacheDir);
    
    suryaProcess = spawn(pythonPath, [serverPath], {
      cwd: workingDir,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
    
    suryaProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log(`Surya: ${msg}`);
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
        console.log(`Surya: ${errorMsg.trim()}`);
      } else {
        console.error(`Surya Error: ${errorMsg}`);
        
        // Check for common errors
        if (errorMsg.includes('ModuleNotFoundError') || errorMsg.includes('No module named')) {
          console.error('\n⚠️  Python dependencies not installed!');
          console.error('Please run: pip install -r requirements.txt\n');
        }
      }
    });
    
    suryaProcess.on('close', (code) => {
      console.log(`Surya server exited with code ${code}`);
      suryaProcess = null;
      
      // Don't auto-restart
      if (code !== 0 && code !== null) {
        console.log('Surya server stopped');
      }
    });
    
    suryaProcess.on('error', (err) => {
      console.error('Failed to start Surya server:', err);
      if (err.code === 'ENOENT') {
        console.error('\n⚠️  Python not found!');
        console.error('Please install Python 3.9+ from https://www.python.org/downloads/\n');
      }
      suryaProcess = null;
    });
    
  } catch (error) {
    console.error('Error starting Surya server:', error);
  }
}

function stopSuryaServer() {
  if (suryaProcess) {
    console.log('Stopping Surya OCR server...');
    suryaProcess.kill();
    suryaProcess = null;
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
