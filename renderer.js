const fileInput = document.getElementById('fileInput');
const btnOpen = document.getElementById('btnOpen');
const btnCopy = document.getElementById('btnCopy');
const btnExport = document.getElementById('btnExport');
const btnCopyAll = document.getElementById('btnCopyAll');
const btnClear = document.getElementById('btnClear');
const btnExtract = document.getElementById('btnExtract');
const status = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const dropTarget = document.getElementById('dropTarget');
const imagePreviewArea = document.getElementById('imagePreviewArea');
const previewList = document.getElementById('previewList');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const resultCount = document.getElementById('resultCount');
const resultText = document.getElementById('resultText');
const historyList = document.getElementById('historyList');
const btnClearHistory = document.getElementById('btnClearHistory');
const batchImagesWrap = document.getElementById('batchImagesWrap');
const batchImages = document.getElementById('batchImages');
const ocrEngine = document.getElementById('ocrEngine');
const ocrLanguage = document.getElementById('ocrLanguage');
const enablePreprocess = document.getElementById('enablePreprocess');
const codeMode = document.getElementById('codeMode');
const themeToggle = document.getElementById('themeToggle');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');
const deviceSection = document.getElementById('deviceSection');
const deviceInfo = document.getElementById('deviceInfo');
const deviceIcon = document.getElementById('deviceIcon');
const deviceText = document.getElementById('deviceText');
const loadingOverlay = document.getElementById('loadingOverlay');

const IMAGE_EXT = ['.png', '.jpg', '.jpeg'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const PDF_TYPE = 'application/pdf';
const MAX_HISTORY = 50;

let currentText = '';
let currentFileName = '';
let tesseractWorkerPath = null;
let history = [];
let historyIdNext = 1;
let currentBatchUrls = [];
let pendingFiles = [];
let previewUrls = [];
let suryaServerAvailable = false;
let isLoadingModels = false;
let suryaFirstRequestComplete = false;

// Theme management
function getSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  const theme = savedTheme || getSystemTheme();
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = themeToggle.querySelector('.theme-icon');
  icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.title = theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';
}

// Load theme on startup
loadTheme();

// Listen for system theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // Only auto-switch if user hasn't manually set a theme
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      updateThemeIcon(newTheme);
    }
  });
}

// Theme toggle event
themeToggle.addEventListener('click', toggleTheme);

// Load history from localStorage on startup
function loadHistory() {
  try {
    const saved = localStorage.getItem('ocrHistory');
    if (saved) {
      const data = JSON.parse(saved);
      history = data.history || [];
      historyIdNext = data.nextId || 1;
      renderHistory();
      console.log(`Loaded ${history.length} history items from localStorage`);
    }
  } catch (e) {
    console.error('Failed to load history:', e);
    history = [];
    historyIdNext = 1;
  }
}

// Save history to localStorage
function saveHistory() {
  try {
    localStorage.setItem('ocrHistory', JSON.stringify({
      history: history,
      nextId: historyIdNext
    }));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

// Show loading overlay and check Surya server availability on load
function showLoadingOverlay() {
  if (!isLoadingModels) {
    isLoadingModels = true;
    if (loadingOverlay) {
      loadingOverlay.hidden = false;
    }
  }
}

function hideLoadingOverlay() {
  isLoadingModels = false;
  if (loadingOverlay) {
    loadingOverlay.hidden = true;
  }
}

function updateLoadingOverlayText(message, progress = null) {
  const loadingText = document.getElementById('loadingText');
  const loadingProgressFill = document.getElementById('loadingProgressFill');
  
  if (loadingText) {
    loadingText.textContent = message;
  }
  
  if (loadingProgressFill && progress !== null) {
    loadingProgressFill.style.width = `${progress}%`;
  }
  
  // Update step indicators based on progress
  const steps = {
    'step-init': { min: 0, max: 5, icon: '✅' },
    'step-gpu': { min: 5, max: 15, icon: '✅' },
    'step-detection': { min: 15, max: 50, icon: '✅' },
    'step-recognition': { min: 50, max: 85, icon: '✅' },
    'step-warmup': { min: 85, max: 100, icon: '✅' }
  };
  
  if (progress !== null) {
    Object.keys(steps).forEach(stepId => {
      const step = document.getElementById(stepId);
      const stepData = steps[stepId];
      const icon = step?.querySelector('.loading-step-icon');
      
      if (step && icon) {
        if (progress >= stepData.max) {
          // Complete
          step.classList.remove('active');
          step.classList.add('complete');
          icon.textContent = stepData.icon;
        } else if (progress >= stepData.min && progress < stepData.max) {
          // Active
          step.classList.add('active');
          step.classList.remove('complete');
          icon.textContent = '⏳';
        } else {
          // Pending
          step.classList.remove('active', 'complete');
          icon.textContent = '⏳';
        }
      }
    });
  }
}

// Load history on startup
loadHistory();

// Show loading overlay on startup - wait for Surya server to be ready
console.log('🔄 Waiting for Surya OCR server to start...');
showLoadingOverlay();
updateLoadingOverlayText('กำลังเริ่มต้น Surya OCR...', 0);

// Check for loading progress every 1 second - NO TIMEOUT, wait until ready
const progressCheckInterval = setInterval(async () => {
  try {
    const response = await fetch('http://localhost:5000/progress', { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Loading progress:', data);
      
      if (data.status === 'loading') {
        // Show detailed progress message
        updateLoadingOverlayText(data.message || 'กำลังโหลด...', data.progress);
      } else if (data.status === 'ready') {
        console.log('✅ Models loaded successfully!');
        updateLoadingOverlayText('✅ พร้อมใช้งาน!', 100);
        
        // Wait 1 second to show completion message, then hide
        setTimeout(() => {
          hideLoadingOverlay();
          clearInterval(progressCheckInterval);
          suryaServerAvailable = true;
          
          // Update device info
          if (data.device) {
            window.suryaDeviceInfo = data.device;
            updateDeviceUI(data.device);
            const deviceText = getDeviceDisplayText(data.device);
            setStatus(`Surya OCR พร้อมใช้งาน (${deviceText})`, 'success');
          } else {
            setStatus('Surya OCR พร้อมใช้งาน', 'success');
          }
          
          // No notification needed - user already sees loading overlay disappear
        }, 1000);
      } else if (data.status === 'error') {
        console.error('❌ Error loading models:', data.message);
        updateLoadingOverlayText('❌ เกิดข้อผิดพลาด: ' + data.message);
        
        // Wait 3 seconds to show error message, then hide
        setTimeout(() => {
          hideLoadingOverlay();
          clearInterval(progressCheckInterval);
          setStatus('เกิดข้อผิดพลาดในการโหลด Surya OCR', 'error');
          
          // Show error notification
          if (window.electronAPI?.showNotification) {
            window.electronAPI.showNotification({
              title: 'ไม่สามารถโหลด Surya OCR',
              body: 'เกิดข้อผิดพลาด: ' + data.message,
              urgency: 'critical',
              onClick: false
            });
          }
        }, 3000);
      } else if (data.status === 'not_started') {
        // Server is running but models not loaded yet
        updateLoadingOverlayText('⏳ กำลังเริ่มต้นโหลดโมเดล AI...', 0);
      }
    }
  } catch (error) {
    // Server not ready yet, keep checking
    // Show waiting message
    updateLoadingOverlayText('⏳ รอ Surya OCR เริ่มทำงาน...', 0);
  }
}, 1000); // Check every 1 second - NO TIMEOUT, will check forever until ready

function updateSuryaUI() {
  // No warning banner anymore, just update status
  if (suryaServerAvailable) {
    if (ocrEngine && ocrEngine.value === 'surya') {
      setStatus('Surya OCR พร้อมใช้งาน', 'success');
    }
  } else {
    if (ocrEngine && ocrEngine.value === 'surya') {
      setStatus('Surya OCR ไม่พร้อมใช้งาน - กำลังเชื่อมต่อ...', 'loading');
    }
  }
}

async function checkSuryaServer() {
  try {
    console.log('Checking Surya server...');
    
    // First check if Electron knows about the process
    if (window.electronAPI?.checkSuryaAvailable) {
      const available = await window.electronAPI.checkSuryaAvailable();
      console.log('Surya process available:', available);
      if (!available) {
        suryaServerAvailable = false;
        console.log('Surya OCR server not started by Electron');
        return;
      }
    }
    
    // Then check if server is responding
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    console.log('Fetching http://localhost:5000/health...');
    const response = await fetch('http://localhost:5000/health', { 
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Surya server response:', data);
      suryaServerAvailable = true;
      console.log('✅ Surya OCR server is available');
      
      // Store device info
      window.suryaDeviceInfo = data.device || 'unknown';
      
      // Update device UI
      updateDeviceUI(data.device);
      
      // Update status if Surya is selected
      if (ocrEngine && ocrEngine.value === 'surya') {
        const deviceText = getDeviceDisplayText(data.device);
        setStatus(`Surya OCR พร้อมใช้งาน (${deviceText})`, 'success');
      }
      
      // Hide loading overlay when Surya is ready
      hideLoadingOverlay();
    } else {
      suryaServerAvailable = false;
      deviceSection.hidden = true;
      console.log('❌ Surya server returned non-OK status');
    }
  } catch (e) {
    suryaServerAvailable = false;
    console.log('❌ Surya OCR server not available:', e.message);
    console.log('Error details:', e);
  }
}

function getDeviceDisplayText(device) {
  if (!device) return 'CPU';
  
  const deviceStr = device.toLowerCase();
  
  if (deviceStr.includes('cuda')) {
    return '🚀 GPU (CUDA)';
  } else if (deviceStr.includes('mps')) {
    return '⚡ GPU (Apple Silicon)';
  } else if (deviceStr.includes('cpu')) {
    return '💻 CPU';
  }
  
  return device;
}

function updateDeviceUI(device) {
  if (!device) {
    deviceSection.hidden = true;
    return;
  }
  
  const deviceStr = device.toLowerCase();
  
  // Remove all classes
  deviceInfo.classList.remove('gpu', 'cpu');
  
  if (deviceStr.includes('cuda')) {
    deviceIcon.textContent = '🚀';
    deviceText.textContent = 'GPU (NVIDIA CUDA)';
    deviceInfo.classList.add('gpu');
    deviceSection.hidden = false;
  } else if (deviceStr.includes('mps')) {
    deviceIcon.textContent = '⚡';
    deviceText.textContent = 'GPU (Apple Silicon)';
    deviceInfo.classList.add('gpu');
    deviceSection.hidden = false;
  } else if (deviceStr.includes('cpu')) {
    deviceIcon.textContent = '💻';
    deviceText.textContent = 'CPU';
    deviceInfo.classList.add('cpu');
    deviceSection.hidden = false;
  } else {
    deviceIcon.textContent = '❓';
    deviceText.textContent = device;
    deviceSection.hidden = false;
  }
}

async function imageToBase64(imageSource) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    
    if (imageSource instanceof Blob || imageSource instanceof File) {
      img.src = URL.createObjectURL(imageSource);
    } else {
      img.src = imageSource;
    }
  });
}

async function suryaOCR(imageSource, langs = ['en']) {
  if (!suryaServerAvailable) {
    throw new Error('Surya OCR server ไม่พร้อมใช้งาน');
  }
  
  try {
    // Don't show loading overlay for OCR requests
    // Loading overlay is only shown during initial model loading
    
    // Show device info in status
    const deviceText = window.suryaDeviceInfo ? getDeviceDisplayText(window.suryaDeviceInfo) : 'CPU';
    setStatus(`กำลังประมวลผล... (${deviceText})`, 'loading');
    
    console.log('Converting image to base64...');
    const base64Image = await imageToBase64(imageSource);
    console.log('Image converted, sending to Surya server...');
    
    const response = await fetch('http://localhost:5000/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image: base64Image,
        langs: langs
      })
    });
    
    console.log('Surya OCR response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Surya OCR error: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Surya OCR result:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }
    
    // Mark first request as complete
    suryaFirstRequestComplete = true;
    
    return result.text;
  } catch (error) {
    console.error('Surya OCR error:', error);
    throw error;
  }
}

async function getTesseractOptions() {
  const opts = {
    logger: (m) => {
      if (m.status === 'recognizing text') setStatus(`OCR — ${Math.round(m.progress * 100)}%`, 'loading');
    },
  };
  
  // Code mode: optimize for code recognition
  if (codeMode.checked) {
    opts.tessedit_char_whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()[]{}/<>@#$%^&*-+=_|\\"\'\n\t`~';
    opts.tessedit_pageseg_mode = '6'; // Assume uniform block of text
  }
  
  if (window.Tesseract && window.electronAPI?.getTesseractWorkerPath) {
    if (tesseractWorkerPath === null) {
      try {
        tesseractWorkerPath = await window.electronAPI.getTesseractWorkerPath();
      } catch (e) {
        console.warn('Tesseract worker path not set:', e);
      }
    }
    if (tesseractWorkerPath) {
      opts.workerPath = tesseractWorkerPath;
      opts.workerBlobURL = false;
    }
  }
  return opts;
}

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = 'status' + (type ? ' ' + type : '');
}

function setFileInfo(text) {
  fileInfo.textContent = text || 'ยังไม่ได้เลือกไฟล์';
}

function updateResultUI(text, meta = '', fileName = '') {
  currentText = text;
  currentFileName = fileName || currentFileName;
  resultText.value = text;
  const hasText = !!text.trim();
  btnCopy.disabled = !hasText;
  btnExport.disabled = !hasText;
  btnCopyAll.disabled = !hasText;
  if (hasText) {
    const lines = text.split(/\n/).filter(Boolean).length;
    resultCount.textContent = lines > 0 ? `${lines} บรรทัด` : '1 รายการ';
  } else {
    resultCount.textContent = '0 รายการ';
  }
}

function addToHistory(label, text, fileName = '', imageUrls = []) {
  const id = String(historyIdNext++);
  
  // Convert all image URLs to base64 for storage
  const imagePromises = imageUrls.map(url => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // Compress to 60% quality
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  });
  
  Promise.all(imagePromises).then(images => {
    const validImages = images.filter(img => img !== null);
    const entry = {
      id,
      label,
      text,
      fileName: fileName || `history-${id}.txt`,
      timestamp: Date.now(),
      images: validImages // Store all images
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.pop();
    saveHistory();
    renderHistory();
  });
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">ยังไม่มีประวัติ</li>';
    return;
  }
  historyList.innerHTML = history
    .map(
      (entry) => {
        const time = new Date(entry.timestamp);
        const day = String(time.getDate()).padStart(2, '0');
        const month = String(time.getMonth() + 1).padStart(2, '0');
        const year = time.getFullYear();
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        const timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        
        // Support both old format (image) and new format (images)
        const images = entry.images || (entry.image ? [entry.image] : []);
        const imageHtml = images.length > 0
          ? `<img src="${images[0]}" class="history-item-thumb" alt="thumbnail" />`
          : '';
        
        const imageCount = images.length > 1 ? `<span class="history-item-count">${images.length}</span>` : '';
        
        return `<li class="history-item-wrap">
          <button type="button" class="history-item" data-id="${entry.id}" title="${escapeHtml(entry.label)}">
            <div class="history-item-thumb-wrap">
              ${imageHtml}
              ${imageCount}
            </div>
            <div class="history-item-content">
              <span class="history-item-label">${escapeHtml(entry.label)}</span>
              <span class="history-item-time">${timeStr}</span>
            </div>
          </button>
          <button type="button" class="history-item-delete" data-id="${entry.id}" title="ลบรายการ">×</button>
        </li>`;
      }
    )
    .join('');
  historyList.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const entry = history.find((e) => e.id === el.dataset.id);
      if (entry) {
        updateResultUI(entry.text, '', entry.fileName);
        setFileInfo(entry.label);
        
        // Show all images if available
        const images = entry.images || (entry.image ? [entry.image] : []);
        if (images.length > 0) {
          revokeBatchUrls();
          currentBatchUrls = [...images];
          showBatchImages(images);
        }
      }
    });
  });
  historyList.querySelectorAll('.history-item-delete').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      history = history.filter((e) => e.id !== id);
      saveHistory(); // Save to localStorage
      renderHistory();
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function revokeBatchUrls() {
  currentBatchUrls.forEach((url) => URL.revokeObjectURL(url));
  currentBatchUrls = [];
}

function showBatchImages(imageUrls) {
  batchImagesWrap.hidden = true;
  batchImages.innerHTML = '';
  if (!imageUrls || imageUrls.length === 0) return;
  imageUrls.forEach((url, index) => {
    const div = document.createElement('div');
    div.className = 'batch-image-item';
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = `รูปที่ ${index + 1}`;
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
      openLightbox(url);
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'batch-image-remove';
    removeBtn.dataset.index = index;
    removeBtn.title = 'ลบรูปนี้';
    removeBtn.innerHTML = '×';
    removeBtn.addEventListener('click', () => {
      removeBatchImage(index);
    });
    
    const numSpan = document.createElement('span');
    numSpan.className = 'batch-image-num';
    numSpan.textContent = index + 1;
    
    div.appendChild(img);
    div.appendChild(removeBtn);
    div.appendChild(numSpan);
    batchImages.appendChild(div);
  });
  batchImagesWrap.hidden = false;
}

function removeBatchImage(index) {
  if (index < 0 || index >= currentBatchUrls.length) return;
  
  // Revoke URL
  URL.revokeObjectURL(currentBatchUrls[index]);
  
  // Remove from array
  currentBatchUrls.splice(index, 1);
  
  // Re-render
  if (currentBatchUrls.length === 0) {
    batchImagesWrap.hidden = true;
    batchImages.innerHTML = '';
  } else {
    showBatchImages(currentBatchUrls);
  }
}

function getExtension(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function isImage(name, type) {
  if (type && IMAGE_TYPES.some(t => type.toLowerCase().includes(t))) return true;
  return IMAGE_EXT.some(ext => name.toLowerCase().endsWith(ext));
}

function isPdf(name, type) {
  return (type && type === PDF_TYPE) || name.toLowerCase().endsWith('.pdf');
}

function isSupported(fileOrPath) {
  const name = typeof fileOrPath === 'string'
    ? fileOrPath.replace(/^.*[\\/]/, '')
    : (fileOrPath.name || '');
  const ext = getExtension(name);
  return ['.jpg', '.jpeg', '.png', '.pdf'].includes(ext);
}

async function preprocessImage(imageSource) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Scale up for better recognition (3x for code mode, 2.5x for normal)
      const scale = codeMode.checked ? 3 : 2.5;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      // Draw with smoothing disabled for sharper text
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Calculate average brightness to detect dark/light theme
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (data.length / 4);
      const isDarkTheme = avgBrightness < 128;
      
      // Process pixels
      for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        
        let value;
        if (codeMode.checked) {
          // Code mode: more aggressive processing
          if (isDarkTheme) {
            const inverted = 255 - gray;
            value = inverted > 80 ? 0 : 255; // Lower threshold for better character detection
          } else {
            value = gray > 140 ? 255 : 0; // Higher threshold for cleaner text
          }
        } else {
          // Normal mode: adaptive threshold based on theme
          if (isDarkTheme) {
            const inverted = 255 - gray;
            value = inverted > 100 ? 0 : 255;
          } else {
            value = gray > 128 ? 255 : 0;
          }
        }
        
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
      }
      
      // Apply sharpening filter for code mode
      if (codeMode.checked) {
        const sharpened = applySharpening(imageData);
        ctx.putImageData(sharpened, 0, 0);
      } else {
        ctx.putImageData(imageData, 0, 0);
      }
      
      canvas.toBlob(resolve, 'image/png');
    };
    
    if (imageSource instanceof Blob || imageSource instanceof File) {
      img.src = URL.createObjectURL(imageSource);
    } else {
      img.src = imageSource;
    }
  });
}

function applySharpening(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const output = new ImageData(width, height);
  
  // Sharpening kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0, g = 0, b = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          r += data[idx] * k;
          g += data[idx + 1] * k;
          b += data[idx + 2] * k;
        }
      }
      
      const outIdx = (y * width + x) * 4;
      output.data[outIdx] = Math.max(0, Math.min(255, r));
      output.data[outIdx + 1] = Math.max(0, Math.min(255, g));
      output.data[outIdx + 2] = Math.max(0, Math.min(255, b));
      output.data[outIdx + 3] = 255;
    }
  }
  
  return output;
}

async function extractOneFromFile(file) {
  console.log('extractOneFromFile called with:', file);
  const name = file.name || 'ไฟล์';
  const type = file.type || '';
  console.log('File name:', name, 'Type:', type);

  if (isImage(name, type)) {
    const engine = ocrEngine.value || 'tesseract';
    console.log('Using engine:', engine);
    
    if (engine === 'surya') {
      // Use Surya OCR
      try {
        const langMap = {
          'tha+eng': ['th', 'en'],
          'eng': ['en'],
          'tha': ['th']
        };
        const langs = langMap[ocrLanguage.value] || ['en'];
        console.log('Surya OCR with langs:', langs);
        
        setStatus(`Surya OCR: ${name}...`, 'loading');
        const text = await suryaOCR(file, langs);
        console.log('Surya OCR result:', text.substring(0, 100));
        return { text: text.trim(), name };
      } catch (error) {
        console.error('Surya OCR error:', error);
        setStatus(`Surya OCR error: ${error.message}`, 'error');
        throw error;
      }
    } else {
      // Use Tesseract
      console.log('Using Tesseract');
      const Tesseract = window.Tesseract;
      const options = await getTesseractOptions();
      options.logger = (m) => {
        if (m.status === 'recognizing text') setStatus(`OCR: ${name} — ${Math.round(m.progress * 100)}%`, 'loading');
      };
      
      // Preprocess image if enabled
      const imageToProcess = enablePreprocess.checked ? await preprocessImage(file) : file;
      const lang = ocrLanguage.value || 'tha+eng';
      const result = await Tesseract.recognize(imageToProcess, lang, options);
      return { text: result.data.text.trim(), name };
    }
  }

  if (isPdf(name, type)) {
    const buffer = await file.arrayBuffer();
    const { text } = await window.electronAPI.extractPdfFromBuffer(buffer);
    return { text: (text || '').trim(), name };
  }

  return { text: '', name };
}

async function extractOneFromPath(filePath) {
  const name = filePath.replace(/^.*[\\/]/, '');
  const ext = getExtension(name);

  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    const buffer = await window.electronAPI.readFileAsBuffer(filePath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const engine = ocrEngine.value || 'tesseract';
    
    if (engine === 'surya') {
      // Use Surya OCR
      try {
        const langMap = {
          'tha+eng': ['th', 'en'],
          'eng': ['en'],
          'tha': ['th']
        };
        const langs = langMap[ocrLanguage.value] || ['en'];
        
        setStatus(`Surya OCR: ${name}...`, 'loading');
        const text = await suryaOCR(blob, langs);
        return { text: text.trim(), name };
      } catch (error) {
        setStatus(`Surya OCR error: ${error.message}`, 'error');
        throw error;
      }
    } else {
      // Use Tesseract
      const Tesseract = window.Tesseract;
      const options = await getTesseractOptions();
      options.logger = (m) => {
        if (m.status === 'recognizing text') setStatus(`OCR: ${name} — ${Math.round(m.progress * 100)}%`, 'loading');
      };
      
      // Preprocess image if enabled
      const imageToProcess = enablePreprocess.checked ? await preprocessImage(blob) : blob;
      const lang = ocrLanguage.value || 'tha+eng';
      const result = await Tesseract.recognize(imageToProcess, lang, options);
      return { text: result.data.text.trim(), name };
    }
  }

  if (ext === '.pdf') {
    const { text } = await window.electronAPI.extractPdfFromPath(filePath);
    return { text: (text || '').trim(), name };
  }

  return { text: '', name };
}

function combineResults(parts) {
  return parts
    .map(({ text, name }) => {
      return text ? text : '';
    })
    .filter(Boolean)
    .join('\n\n\n');
}

async function handleFiles(filesOrPaths, optionalLabel = '') {
  const list = Array.isArray(filesOrPaths) ? filesOrPaths : [filesOrPaths];
  const supported = list.filter(isSupported);

  if (supported.length === 0) {
    setStatus('ไม่มีไฟล์ที่รองรับ (.jpg .png .pdf)', 'error');
    return;
  }

  revokeBatchUrls();
  const imageUrlsInOrder = [];

  setStatus(`กำลังประมวลผล ${supported.length} ไฟล์...`, 'loading');
  const parts = [];
  const total = supported.length;

  try {
    for (let i = 0; i < supported.length; i++) {
      const item = supported[i];
      const name = typeof item === 'string' ? item.replace(/^.*[\\/]/, '') : item.name;
      setStatus(`[${i + 1}/${total}] ${name}`, 'loading');

      if (item instanceof File) {
        if (isImage(name, item.type)) {
          imageUrlsInOrder.push(URL.createObjectURL(item));
          currentBatchUrls.push(imageUrlsInOrder[imageUrlsInOrder.length - 1]);
        }
        parts.push(await extractOneFromFile(item));
      } else if (typeof item === 'string') {
        const ext = getExtension(name);
        if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          const buffer = await window.electronAPI.readFileAsBuffer(item);
          const blob = new Blob([buffer], { type: 'image/png' });
          imageUrlsInOrder.push(URL.createObjectURL(blob));
          currentBatchUrls.push(imageUrlsInOrder[imageUrlsInOrder.length - 1]);
        }
        parts.push(await extractOneFromPath(item));
      }
    }

    showBatchImages(imageUrlsInOrder);

    const combined = combineResults(parts);
    const count = parts.filter(p => p.text).length;
    setStatus(`ดึงข้อความจาก ${count}/${total} ไฟล์เรียบร้อย`, 'success');
    const fileLabel = optionalLabel || (supported.length === 1 ? (supported[0].name || supported[0].replace(/^.*[\\/]/, '')) : `${supported.length} ไฟล์`);
    setFileInfo(fileLabel);
    const outFileName = supported.length > 1 ? 'extracted.txt' : (supported[0].name || supported[0].replace(/^.*[\\/]/, ''));
    updateResultUI(combined, '', outFileName);
    addToHistory(fileLabel, combined, outFileName, imageUrlsInOrder);
    
    // Show success notification
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification({
        title: 'OCR เสร็จสมบูรณ์',
        body: `ดึงข้อความจาก ${count}/${total} ไฟล์เรียบร้อยแล้ว`,
        urgency: 'normal',
        onClick: true
      });
    }
  } catch (err) {
    revokeBatchUrls();
    setStatus('เกิดข้อผิดพลาด: ' + (err.message || err), 'error');
    
    // Show error notification
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification({
        title: 'OCR ล้มเหลว',
        body: `เกิดข้อผิดพลาด: ${err.message || 'ไม่ทราบสาเหตุ'}`,
        urgency: 'critical',
        onClick: true
      });
    }
  }
}

// ----- Preview functions -----
function clearPreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  pendingFiles = [];
  previewList.innerHTML = '';
  previewList.hidden = true;
  previewPlaceholder.hidden = false;
  imagePreviewArea.classList.remove('has-image');
  btnExtract.disabled = true;
}

async function showPreview(files, append = false) {
  if (!append) {
    clearPreview();
  }
  
  const imageFiles = files.filter(f => {
    const name = typeof f === 'string' ? f.replace(/^.*[\\/]/, '') : (f.name || '');
    const type = typeof f === 'string' ? '' : (f.type || '');
    return isImage(name, type);
  });
  if (imageFiles.length === 0) return false;

  // Append to existing files
  pendingFiles.push(...imageFiles);
  
  previewList.hidden = false;
  previewPlaceholder.hidden = true;
  imagePreviewArea.classList.add('has-image');
  btnExtract.disabled = false;

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    let url = '';
    if (file instanceof File) {
      url = URL.createObjectURL(file);
    } else if (typeof file === 'string') {
      try {
        const buffer = await window.electronAPI.readFileAsBuffer(file);
        const blob = new Blob([buffer], { type: 'image/png' });
        url = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Failed to load image preview:', e);
        continue;
      }
    }

    if (url) {
      const currentIndex = previewUrls.length;
      const wrap = document.createElement('div');
      wrap.className = 'preview-thumb-wrap';
      wrap.dataset.index = currentIndex;
      
      const img = document.createElement('img');
      img.className = 'preview-thumb';
      img.src = url;
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => {
        openLightbox(url);
      });
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-thumb-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'ลบรูปนี้';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePreviewImage(currentIndex);
      });
      
      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      previewUrls.push(url);
      previewList.appendChild(wrap);
    }
  }

  const label = pendingFiles.length === 1
    ? (typeof pendingFiles[0] === 'string' ? pendingFiles[0].replace(/^.*[\\/]/, '') : (pendingFiles[0].name || 'รูป'))
    : `${pendingFiles.length} รูป`;
  setFileInfo(label);
  setStatus('วางรูปแล้ว — กดปุ่ม "ดึงข้อความจากรูป" เพื่อเริ่ม OCR', 'success');
  return true;
}

function removePreviewImage(index) {
  if (index < 0 || index >= pendingFiles.length) return;
  
  // Revoke URL
  if (previewUrls[index]) {
    URL.revokeObjectURL(previewUrls[index]);
  }
  
  // Remove from arrays
  pendingFiles.splice(index, 1);
  previewUrls.splice(index, 1);
  
  // Re-render preview
  if (pendingFiles.length === 0) {
    clearPreview();
  } else {
    // Rebuild preview list
    previewList.innerHTML = '';
    for (let i = 0; i < pendingFiles.length; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'preview-thumb-wrap';
      wrap.dataset.index = i;
      
      const img = document.createElement('img');
      img.className = 'preview-thumb';
      img.src = previewUrls[i];
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-thumb-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'ลบรูปนี้';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePreviewImage(i);
      });
      
      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      previewList.appendChild(wrap);
    }
    
    const label = pendingFiles.length === 1
      ? (typeof pendingFiles[0] === 'string' ? pendingFiles[0].replace(/^.*[\\/]/, '') : (pendingFiles[0].name || 'รูป'))
      : `${pendingFiles.length} รูป`;
    setFileInfo(label);
  }
}

function clearAll() {
  currentText = '';
  currentFileName = '';
  setFileInfo('ยังไม่ได้เลือกไฟล์');
  setStatus('พร้อม');
  updateResultUI('', '', '');
  revokeBatchUrls();
  batchImagesWrap.hidden = true;
  batchImages.innerHTML = '';
  clearPreview();
}

// ----- Events -----

// Paste: show preview for images
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imageFiles = [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault();
    showPreview(imageFiles, true); // append mode
  }
});

// Image preview area: drag & drop
imagePreviewArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  imagePreviewArea.classList.add('drag-over');
});

imagePreviewArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  imagePreviewArea.classList.remove('drag-over');
});

imagePreviewArea.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  imagePreviewArea.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) {
    // Separate images and PDFs
    const images = files.filter(f => isImage(f.name, f.type));
    const pdfs = files.filter(f => isPdf(f.name, f.type));
    if (images.length) showPreview(images, true); // append mode
    if (pdfs.length) handleFiles(pdfs);
  }
});

// Main panel: also accept drop
dropTarget.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropTarget.classList.add('drag-over');
});

dropTarget.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropTarget.classList.remove('drag-over');
});

dropTarget.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) {
    const images = files.filter(f => isImage(f.name, f.type));
    const pdfs = files.filter(f => isPdf(f.name, f.type));
    if (images.length) showPreview(images, true); // append mode
    if (pdfs.length) handleFiles(pdfs);
  }
});

btnOpen.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  if (files.length) {
    const images = files.filter(f => isImage(f.name, f.type));
    const pdfs = files.filter(f => isPdf(f.name, f.type));
    if (images.length) showPreview(images, true); // append mode
    if (pdfs.length) handleFiles(pdfs);
  }
  fileInput.value = '';
});

// Extract button: process pending images
btnExtract.addEventListener('click', async () => {
  console.log('Extract button clicked!');
  console.log('Pending files:', pendingFiles.length);
  console.log('OCR Engine:', ocrEngine.value);
  
  if (pendingFiles.length === 0) {
    console.log('No pending files, returning');
    return;
  }
  
  const filesToProcess = [...pendingFiles];
  const label = filesToProcess.length === 1
    ? (filesToProcess[0].name || filesToProcess[0].replace?.(/^.*[\\/]/, '') || 'รูป')
    : `${filesToProcess.length} รูป`;
  
  console.log('Processing files:', filesToProcess);
  console.log('Label:', label);
  
  // Set loading state
  btnExtract.disabled = true;
  btnExtract.classList.add('loading');
  const extractIcon = document.getElementById('extractIcon');
  const extractText = document.getElementById('extractText');
  const originalIcon = extractIcon.textContent;
  extractIcon.textContent = '⏳';
  extractText.textContent = 'กำลังดึงข้อความ...';
  
  try {
    await handleFiles(filesToProcess, label);
    console.log('Files processed successfully');
  } catch (error) {
    console.error('Error processing files:', error);
    setStatus('เกิดข้อผิดพลาด: ' + error.message, 'error');
  } finally {
    // Remove loading state
    btnExtract.disabled = false;
    btnExtract.classList.remove('loading');
    extractIcon.textContent = originalIcon;
    extractText.textContent = 'ดึงข้อความจากรูป';
  }
  
  // Keep preview visible, don't clear it
});

// Lightbox functions
function openLightbox(imageSrc) {
  lightboxImage.src = imageSrc;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = '';
  document.body.style.overflow = '';
}

// Lightbox event listeners
lightboxClose.addEventListener('click', closeLightbox);

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) {
    closeLightbox();
  }
});

function doCopy() {
  if (!currentText) return;
  navigator.clipboard.writeText(currentText).then(
    () => setStatus('คัดลอกข้อความแล้ว', 'success'),
    () => setStatus('คัดลอกไม่สำเร็จ', 'error')
  );
}

btnCopy.addEventListener('click', doCopy);
btnCopyAll.addEventListener('click', doCopy);

btnExport.addEventListener('click', async () => {
  if (!currentText) return;
  const defaultName = (currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'extracted') + '.txt';
  const path = await window.electronAPI.saveDialog(defaultName);
  if (path) {
    await window.electronAPI.writeText(path, currentText);
    setStatus('บันทึกไฟล์แล้ว', 'success');
  }
});

btnClear.addEventListener('click', clearAll);

btnClearHistory.addEventListener('click', () => {
  history = [];
  historyIdNext = 1;
  saveHistory(); // Save to localStorage
  renderHistory();
  setStatus('ล้างประวัติแล้ว', 'success');
});

renderHistory();
updateResultUI('');

// Check Surya server and show/hide warning
ocrEngine.addEventListener('change', async () => {
  console.log('OCR Engine changed to:', ocrEngine.value);
  if (ocrEngine.value === 'surya') {
    console.log('Surya OCR selected, checking server...');
    
    // Only show loading if server hasn't been checked yet
    if (!suryaServerAvailable && !suryaFirstRequestComplete) {
      showLoadingOverlay();
    }
    
    await checkSuryaServer();
    updateSuryaUI();
    
    hideLoadingOverlay();
    
    // Show device info in status
    if (suryaServerAvailable && window.suryaDeviceInfo) {
      const deviceText = getDeviceDisplayText(window.suryaDeviceInfo);
      setStatus(`Surya OCR พร้อมใช้งาน (${deviceText})`, 'success');
      updateDeviceUI(window.suryaDeviceInfo);
    }
  } else {
    setStatus('พร้อม');
    deviceSection.hidden = true;
  }
});

// Recheck Surya server every 10 seconds when Surya is selected
setInterval(async () => {
  if (ocrEngine.value === 'surya' && !suryaServerAvailable) {
    console.log('Auto-checking Surya server...');
    await checkSuryaServer();
    updateSuryaUI();
  }
}, 10000);



