const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  getTesseractWorkerPath: () => ipcRenderer.invoke('app:getTesseractWorkerPath'),
  readFileAsBuffer: (path) => ipcRenderer.invoke('file:readAsBuffer', path),
  readFileAsText: (path) => ipcRenderer.invoke('file:readAsText', path),
  writeText: (path, text) => ipcRenderer.invoke('file:writeText', path, text),
  extractPdfFromPath: (path) => ipcRenderer.invoke('pdf:extractFromPath', path),
  extractPdfFromBuffer: (buffer) => ipcRenderer.invoke('pdf:extractFromBuffer', buffer),
  checkSuryaAvailable: () => ipcRenderer.invoke('surya:checkAvailable'),
  restartSurya: () => ipcRenderer.invoke('surya:restart'),
  showNotification: (options) => ipcRenderer.invoke('notification:show', options),
});
