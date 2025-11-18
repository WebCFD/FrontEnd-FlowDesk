#!/usr/bin/env python3
"""
Helper script to upload VTK files to Replit Object Storage.
Called by worker_monitor.py after post-processing completes.
"""

import os
import sys
import requests
import glob
from pathlib import Path

def get_upload_url(simulation_id: int, filename: str) -> str:
    """Get presigned upload URL from Express backend."""
    # In production, Express runs on port 5000
    base_url = os.getenv("BASE_URL", "http://localhost:5000")
    url = f"{base_url}/api/simulations/{simulation_id}/vtk/upload-url"
    
    try:
        response = requests.post(url, json={"filename": filename}, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data["uploadUrl"]
    except Exception as e:
        print(f"❌ Failed to get upload URL: {e}", file=sys.stderr)
        raise

def upload_file_to_storage(file_path: str, upload_url: str) -> bool:
    """Upload file to object storage using presigned URL."""
    try:
        with open(file_path, 'rb') as f:
            # Read file content
            content = f.read()
            
        # Upload using PUT request
        response = requests.put(
            upload_url,
            data=content,
            headers={"Content-Type": "application/octet-stream"},
            timeout=300  # 5 minutes for large files
        )
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"❌ Failed to upload {file_path}: {e}", file=sys.stderr)
        return False

def upload_vtk_files(simulation_id: int, vtk_dir: str) -> dict:
    """
    Upload all VTK files from a directory to object storage.
    
    Args:
        simulation_id: The simulation ID
        vtk_dir: Directory containing VTK files
        
    Returns:
        dict with 'success' (bool) and 'uploaded_files' (list)
    """
    vtk_files = glob.glob(os.path.join(vtk_dir, "*.vtk"))
    
    if not vtk_files:
        print(f"⚠️  No VTK files found in {vtk_dir}", file=sys.stderr)
        return {"success": False, "uploaded_files": []}
    
    print(f"📤 Uploading {len(vtk_files)} VTK files to object storage...")
    uploaded_files = []
    failed_files = []
    
    for vtk_file in vtk_files:
        filename = os.path.basename(vtk_file)
        print(f"  → {filename}")
        
        try:
            # Get presigned URL
            upload_url = get_upload_url(simulation_id, filename)
            
            # Upload file
            if upload_file_to_storage(vtk_file, upload_url):
                uploaded_files.append(filename)
                print(f"    ✅ Uploaded successfully")
            else:
                failed_files.append(filename)
        except Exception as e:
            print(f"    ❌ Failed: {e}", file=sys.stderr)
            failed_files.append(filename)
    
    success = len(failed_files) == 0
    print(f"\n{'✅' if success else '⚠️ '} Upload complete: {len(uploaded_files)}/{len(vtk_files)} files")
    
    if failed_files:
        print(f"   Failed files: {', '.join(failed_files)}", file=sys.stderr)
    
    return {
        "success": success,
        "uploaded_files": uploaded_files,
        "failed_files": failed_files
    }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python upload_vtk_to_storage.py <simulation_id> <vtk_directory>", file=sys.stderr)
        sys.exit(1)
    
    simulation_id = int(sys.argv[1])
    vtk_dir = sys.argv[2]
    
    result = upload_vtk_files(simulation_id, vtk_dir)
    sys.exit(0 if result["success"] else 1)
