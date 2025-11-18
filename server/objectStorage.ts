// Referenced from blueprint:javascript_object_storage
// Simplified version for VTK file storage (no ACL, no user uploads)
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

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

// Sign a URL for object access
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
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

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 3600, // 1 hour for upload
    });
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
