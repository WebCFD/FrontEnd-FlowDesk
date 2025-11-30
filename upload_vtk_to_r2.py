#!/usr/bin/env python3
"""
Upload VTK files to Cloudflare R2 storage.
This script is called by worker_monitor.py after post-processing completes.
"""

import os
import sys
import boto3
from botocore.config import Config

R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "flowdesk-vtk-storage")

def get_r2_client():
    """Create and return an R2 client using boto3."""
    endpoint = os.environ.get("R2_ENDPOINT")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    
    if not all([endpoint, access_key, secret_key]):
        raise ValueError(
            "R2 credentials not configured. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
        )
    
    # Cloudflare R2 configuration per official docs
    # https://developers.cloudflare.com/r2/examples/aws/boto3/
    return boto3.client(
        service_name="s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4")
    )


def upload_vtk_files(simulation_id: int, vtk_directory: str) -> dict:
    """
    Upload all .vtkjs files from a directory to R2.
    
    Args:
        simulation_id: The simulation ID
        vtk_directory: Path to the directory containing VTK files
        
    Returns:
        Dictionary with upload results
    """
    if not os.path.exists(vtk_directory):
        return {
            "success": False,
            "error": f"Directory not found: {vtk_directory}",
            "uploaded": [],
            "failed": []
        }
    
    vtk_files = [f for f in os.listdir(vtk_directory) if f.endswith(".vtkjs")]
    
    if not vtk_files:
        return {
            "success": True,
            "message": "No VTK files found to upload",
            "uploaded": [],
            "failed": []
        }
    
    print(f"[R2] Found {len(vtk_files)} VTK files to upload for simulation {simulation_id}")
    
    try:
        client = get_r2_client()
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "uploaded": [],
            "failed": []
        }
    
    uploaded = []
    failed = []
    
    for filename in vtk_files:
        filepath = os.path.join(vtk_directory, filename)
        key = f"vtk/{simulation_id}/{filename}"
        
        try:
            file_size = os.path.getsize(filepath)
            print(f"[R2] Uploading {filename} ({file_size} bytes) -> {key}")
            
            with open(filepath, "rb") as f:
                client.upload_fileobj(
                    f,
                    R2_BUCKET_NAME,
                    key,
                    ExtraArgs={"ContentType": "application/octet-stream"}
                )
            
            uploaded.append({
                "filename": filename,
                "key": key,
                "size": file_size
            })
            print(f"[R2] ✓ Successfully uploaded {filename}")
            
        except Exception as e:
            error_msg = str(e)
            failed.append({
                "filename": filename,
                "error": error_msg
            })
            print(f"[R2] ✗ Failed to upload {filename}: {error_msg}")
    
    total_size = sum(f["size"] for f in uploaded)
    print(f"[R2] Upload complete: {len(uploaded)} files ({total_size} bytes), {len(failed)} failed")
    
    return {
        "success": len(failed) == 0,
        "uploaded": uploaded,
        "failed": failed,
        "total_size": total_size
    }


def verify_upload(simulation_id: int) -> dict:
    """
    Verify that VTK files exist in R2 for a simulation.
    
    Args:
        simulation_id: The simulation ID
        
    Returns:
        Dictionary with verification results
    """
    try:
        client = get_r2_client()
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "files": []
        }
    
    prefix = f"vtk/{simulation_id}/"
    
    try:
        response = client.list_objects_v2(
            Bucket=R2_BUCKET_NAME,
            Prefix=prefix
        )
        
        files = []
        if "Contents" in response:
            for obj in response["Contents"]:
                key = obj["Key"]
                filename = key.replace(prefix, "")
                if filename:
                    files.append({
                        "filename": filename,
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat()
                    })
        
        return {
            "success": True,
            "files": files,
            "count": len(files)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "files": []
        }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python upload_vtk_to_r2.py <simulation_id> <vtk_directory>")
        print("       python upload_vtk_to_r2.py --verify <simulation_id>")
        sys.exit(1)
    
    if sys.argv[1] == "--verify":
        simulation_id = int(sys.argv[2])
        result = verify_upload(simulation_id)
        print(f"Verification result: {result}")
    else:
        simulation_id = int(sys.argv[1])
        vtk_directory = sys.argv[2]
        result = upload_vtk_files(simulation_id, vtk_directory)
        print(f"Upload result: {result}")
        
        if not result["success"]:
            sys.exit(1)
