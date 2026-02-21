#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Surya OCR Server for Electron App
Provides better OCR accuracy than Tesseract, especially for code and special characters
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import base64
import os
import sys
import torch

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

app = Flask(__name__)
CORS(app)

# Global variable to store model (lazy loading)
ocr_model = None
det_model = None
ocr_processor = None
det_processor = None
device = None
dtype = None

# Set model cache directory to app folder
APP_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_CACHE_DIR = os.path.join(APP_DIR, 'surya_models')
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

# Set environment variable for Hugging Face cache
os.environ['HF_HOME'] = MODEL_CACHE_DIR
os.environ['TRANSFORMERS_CACHE'] = MODEL_CACHE_DIR

def detect_device():
    """Detect best available device (CUDA GPU, MPS, or CPU)"""
    global device, dtype
    
    # Check for CUDA (NVIDIA GPU)
    if torch.cuda.is_available():
        device = torch.device('cuda')
        dtype = torch.float16  # Use half precision for faster inference on GPU
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[GPU] Using CUDA GPU: {gpu_name}")
        print(f"[GPU] CUDA Version: {torch.version.cuda}")
        print(f"[GPU] Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
        print(f"[GPU] GPU will be used for all OCR operations")
        return device, dtype
    
    # Check for MPS (Apple Silicon)
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = torch.device('mps')
        dtype = torch.float32
        print("[GPU] Using Apple Silicon (MPS)")
        print("[GPU] GPU will be used for all OCR operations")
        return device, dtype
    
    # Fallback to CPU
    device = torch.device('cpu')
    dtype = torch.float32
    print("[CPU] No GPU detected, using CPU")
    print("[INFO] For faster processing, install CUDA-enabled PyTorch")
    print("[INFO] See INSTALL_CUDA.md for instructions")
    return device, dtype

def load_models():
    """Load Surya OCR models (lazy loading)"""
    global ocr_model, det_model, ocr_processor, det_processor, device, dtype
    if ocr_model is None:
        try:
            print("Loading Surya OCR models...")
            print(f"Model cache directory: {MODEL_CACHE_DIR}")
            
            # Detect device
            device, dtype = detect_device()
            
            from surya.model.detection.segformer import load_model as load_det_model, load_processor as load_det_processor
            from surya.model.recognition.model import load_model as load_rec_model
            from surya.model.recognition.processor import load_processor as load_rec_processor
            
            print(f"Loading models on device: {device} with dtype: {dtype}")
            
            # Load models in parallel for faster startup
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                det_future = executor.submit(load_det_model)
                det_proc_future = executor.submit(load_det_processor)
                ocr_future = executor.submit(load_rec_model)
                ocr_proc_future = executor.submit(load_rec_processor)
                
                det_model = det_future.result()
                det_processor = det_proc_future.result()
                ocr_model = ocr_future.result()
                ocr_processor = ocr_proc_future.result()
            
            # Move models to device and set dtype
            print(f"Moving models to {device}...")
            det_model = det_model.to(device)
            ocr_model = ocr_model.to(device)
            
            # Convert to appropriate dtype for GPU
            if device.type in ['cuda', 'mps']:
                if dtype == torch.float16 and device.type == 'cuda':
                    det_model = det_model.half()
                    ocr_model = ocr_model.half()
                    print("[GPU] Models converted to float16 for faster inference")
            
            # Set to eval mode
            det_model.eval()
            ocr_model.eval()
            
            # Warm up models with dummy inference for faster first request
            print("[INFO] Warming up models...")
            try:
                dummy_image = Image.new('RGB', (100, 100), color='white')
                from surya.ocr import run_ocr
                _ = run_ocr([dummy_image], [['en']], det_model, det_processor, ocr_model, ocr_processor)
                print("[OK] Models warmed up!")
            except Exception as e:
                print(f"[WARNING] Warmup failed (non-critical): {e}")
            
            print("[OK] Models loaded successfully!")
            print(f"Models cached in: {MODEL_CACHE_DIR}")
            print(f"[INFO] All OCR operations will run on: {device}")
            return True
        except ImportError as e:
            print(f"[ERROR] Surya OCR not installed. Run: pip install surya-ocr")
            print(f"Details: {e}")
            return False
        except Exception as e:
            print(f"[ERROR] Error loading models: {e}")
            import traceback
            traceback.print_exc()
            return False
    return True

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    device_info = str(device) if device else "not initialized"
    return jsonify({
        "status": "ok", 
        "engine": "surya", 
        "cache_dir": MODEL_CACHE_DIR,
        "device": device_info,
        "dtype": str(dtype) if dtype else "not initialized"
    })

@app.route('/ocr', methods=['POST'])
def ocr():
    """OCR endpoint - accepts base64 image"""
    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({"error": "No image provided", "success": False}), 400
        
        # Load models if not loaded
        if not load_models():
            return jsonify({"error": "Failed to load models", "success": False}), 500
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'].split(',')[1] if ',' in data['image'] else data['image'])
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Get language parameter (default to English)
        langs = data.get('langs', ['en'])
        if isinstance(langs, str):
            langs = [langs]
        
        # Run OCR with torch.no_grad() for faster inference
        from surya.ocr import run_ocr
        with torch.no_grad():
            predictions = run_ocr([image], [langs], det_model, det_processor, ocr_model, ocr_processor)
        
        # Extract text from predictions
        text_lines = []
        if predictions and len(predictions) > 0:
            for text_line in predictions[0].text_lines:
                text_lines.append(text_line.text)
        
        result_text = '\n'.join(text_lines)
        
        return jsonify({
            "text": result_text,
            "lines": len(text_lines),
            "success": True
        })
        
    except Exception as e:
        print(f"OCR Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "success": False}), 500

@app.route('/ocr/batch', methods=['POST'])
def ocr_batch():
    """Batch OCR endpoint - accepts multiple base64 images"""
    try:
        data = request.json
        if not data or 'images' not in data:
            return jsonify({"error": "No images provided", "success": False}), 400
        
        # Load models if not loaded
        if not load_models():
            return jsonify({"error": "Failed to load models", "success": False}), 500
        
        images = []
        langs_list = []
        
        # Decode all images
        for item in data['images']:
            image_data = base64.b64decode(item['image'].split(',')[1] if ',' in item['image'] else item['image'])
            image = Image.open(io.BytesIO(image_data))
            if image.mode != 'RGB':
                image = image.convert('RGB')
            images.append(image)
            
            langs = item.get('langs', ['en'])
            if isinstance(langs, str):
                langs = [langs]
            langs_list.append(langs)
        
        # Run batch OCR with torch.no_grad() for faster inference
        from surya.ocr import run_ocr
        with torch.no_grad():
            predictions = run_ocr(images, langs_list, det_model, det_processor, ocr_model, ocr_processor)
        
        # Extract results
        results = []
        for pred in predictions:
            text_lines = [line.text for line in pred.text_lines]
            results.append({
                "text": '\n'.join(text_lines),
                "lines": len(text_lines)
            })
        
        return jsonify({
            "results": results,
            "success": True
        })
        
    except Exception as e:
        print(f"Batch OCR Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "success": False}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("Surya OCR Server")
    print("=" * 50)
    print("Starting server on http://localhost:5000")
    print(f"Model cache: {MODEL_CACHE_DIR}")
    print("Endpoints:")
    print("  GET  /health - Health check")
    print("  POST /ocr - Single image OCR")
    print("  POST /ocr/batch - Batch image OCR")
    print("=" * 50)
    
    # Pre-load models on startup
    print("\nPre-loading models...")
    if load_models():
        print("[OK] Ready to process OCR requests!")
    else:
        print("[WARNING] Models not loaded. Will try to load on first request.")
    
    print("\n" + "=" * 50)
    
    # Run server with host 0.0.0.0 to allow connections from Electron
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
