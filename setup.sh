#!/bin/bash
set -e

echo "Starting backend environment setup..."

# 1. Create a dedicated virtual environment (if missing)
if [ ! -d "backend_venv" ]; then
  python3 -m venv backend_venv
fi
source backend_venv/bin/activate

# 2. Install baseline dependencies
echo "Installing Python dependencies (PyTorch, FastAPI, etc)..."
python3 -m pip install --upgrade pip --no-cache-dir
python3 -m pip install --no-cache-dir torch torchvision numpy pillow trimesh fastapi uvicorn python-multipart

# 3. Create folder structure defined in project layout
echo "Creating directory structure..."
mkdir -p backend/models
mkdir -p uploads/images
mkdir -p assets
mkdir -p scenes

# 4. Clone ML-Sharp
echo "Cloning ML-Sharp..."
if [ ! -d "backend/ml-sharp" ]; then
  git clone https://github.com/apple/ml-sharp.git backend/ml-sharp || echo "Warning: Could not clone apple/ml-sharp. It might be private or hypothetical."
else
  echo "ML-Sharp already cloned."
fi

# 5. Clone TripoSR
echo "Cloning TripoSR..."
if [ ! -d "backend/TripoSR" ]; then
  git clone https://github.com/VAST-AI-Research/TripoSR.git backend/TripoSR || echo "Warning: Could not clone TripoSR."
  if [ -f "backend/TripoSR/requirements.txt" ]; then
    python3 -m pip install --no-cache-dir -r backend/TripoSR/requirements.txt || echo "Warning: Failed to install all TripoSR requirements."
  fi
else
  echo "TripoSR already cloned."
fi

echo "✅ Environment setup complete."
