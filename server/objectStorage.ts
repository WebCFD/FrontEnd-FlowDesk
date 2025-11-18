// Referenced from blueprint:javascript_object_storage
// Simplified version for VTK file storage using Application Default Credentials
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";

// Use Application Default Credentials (ADC) for authentication
// In Replit Publishing + Cloud Run, this automatically authenticates with GCS
export const objectStorageClient = new Storage();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Helper function to parse object path format: /<bucket_name>/<object_name>
function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}


// The object storage service for VTK files
export class ObjectStorageService {
  constructor() {}

  // Gets the private object directory from env var
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Get file from object storage by path
  async getFile(objectPath: string): Promise<File> {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  // Download an object to HTTP response
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Get presigned PUT URL for uploading VTK files from Python workers
  async getVtkUploadUrl(simulationId: number, filename: string): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const objectPath = `${privateDir}/vtk/${simulationId}/${filename}`;
    const { bucketName, objectName } = parseObjectPath(objectPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    // Generate signed URL using native GCS SDK (v4 signature)
    // contentType must match the Content-Type header sent by upload_vtk_to_storage.py
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 3600 * 1000, // 1 hour for upload
      contentType: 'application/octet-stream',
    });

    return url;
  }

  // Get VTK file for a simulation
  async getVtkFile(simulationId: number, filename: string): Promise<File> {
    const privateDir = this.getPrivateObjectDir();
    const objectPath = `${privateDir}/vtk/${simulationId}/${filename}`;
    return this.getFile(objectPath);
  }

  // List all VTK files for a simulation
  async listVtkFiles(simulationId: number): Promise<string[]> {
    const privateDir = this.getPrivateObjectDir();
    const prefix = `${privateDir}/vtk/${simulationId}/`;
    const { bucketName, objectName: prefixPath } = parseObjectPath(prefix);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: prefixPath });
    
    return files.map(file => file.name.split('/').pop()!).filter(Boolean);
  }
}
