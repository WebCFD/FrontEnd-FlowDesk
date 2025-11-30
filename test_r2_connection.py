#!/usr/bin/env python3
"""
Test script to verify Cloudflare R2 connection.
Run with: python test_r2_connection.py
"""

import os
import boto3
from botocore.config import Config

R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "flowdesk-vtk-storage")

def test_r2_connection():
    """Test connection to Cloudflare R2."""
    print("=" * 60)
    print("Testing Cloudflare R2 Connection")
    print("=" * 60)
    
    # Check environment variables
    endpoint = os.environ.get("R2_ENDPOINT")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    
    print(f"\n1. Checking environment variables:")
    print(f"   R2_ENDPOINT: {'✓ Set' if endpoint else '✗ Missing'}")
    print(f"   R2_ACCESS_KEY_ID: {'✓ Set' if access_key else '✗ Missing'}")
    print(f"   R2_SECRET_ACCESS_KEY: {'✓ Set' if secret_key else '✗ Missing'}")
    print(f"   R2_BUCKET_NAME: {R2_BUCKET_NAME}")
    
    if not all([endpoint, access_key, secret_key]):
        print("\n❌ ERROR: Missing required environment variables!")
        return False
    
    # Create client
    print(f"\n2. Creating R2 client...")
    try:
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"}
            ),
            region_name="auto"
        )
        print("   ✓ Client created successfully")
    except Exception as e:
        print(f"   ✗ Failed to create client: {e}")
        return False
    
    # Test bucket access
    print(f"\n3. Testing bucket access ({R2_BUCKET_NAME})...")
    try:
        response = client.list_objects_v2(
            Bucket=R2_BUCKET_NAME,
            MaxKeys=10
        )
        count = response.get("KeyCount", 0)
        print(f"   ✓ Bucket accessible! Found {count} objects")
        
        if count > 0:
            print("\n   Objects in bucket:")
            for obj in response.get("Contents", []):
                print(f"   - {obj['Key']} ({obj['Size']} bytes)")
    except Exception as e:
        print(f"   ✗ Failed to access bucket: {e}")
        return False
    
    # Test upload
    print(f"\n4. Testing file upload...")
    test_key = "test/connection_test.txt"
    test_content = b"R2 connection test - OK"
    
    try:
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=test_key,
            Body=test_content,
            ContentType="text/plain"
        )
        print(f"   ✓ Successfully uploaded test file: {test_key}")
    except Exception as e:
        print(f"   ✗ Failed to upload: {e}")
        return False
    
    # Test download
    print(f"\n5. Testing file download...")
    try:
        response = client.get_object(
            Bucket=R2_BUCKET_NAME,
            Key=test_key
        )
        downloaded = response["Body"].read()
        if downloaded == test_content:
            print(f"   ✓ Successfully downloaded and verified test file")
        else:
            print(f"   ✗ Downloaded content doesn't match!")
            return False
    except Exception as e:
        print(f"   ✗ Failed to download: {e}")
        return False
    
    # Cleanup test file
    print(f"\n6. Cleaning up test file...")
    try:
        client.delete_object(
            Bucket=R2_BUCKET_NAME,
            Key=test_key
        )
        print(f"   ✓ Test file deleted")
    except Exception as e:
        print(f"   ⚠ Failed to delete test file: {e}")
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED - R2 CONNECTION IS WORKING!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = test_r2_connection()
    exit(0 if success else 1)
