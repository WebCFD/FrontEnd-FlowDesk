import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { Readable } from "stream";

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "flowdesk-vtk-storage";

export class R2NotFoundError extends Error {
  constructor() {
    super("Object not found in R2");
    this.name = "R2NotFoundError";
    Object.setPrototypeOf(this, R2NotFoundError.prototype);
  }
}

function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
}

export class R2StorageService {
  private client: S3Client | null = null;
  private lastClientError: Date | null = null;
  private lastClientErrorMessage: string | null = null;
  private readonly CLIENT_RETRY_INTERVAL_MS = 30000; // Retry after 30 seconds on error
  private clientCreationCount: number = 0;

  private getClient(): S3Client {
    const isProduction = process.env.NODE_ENV === 'production';
    const envLabel = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';

    // If we had an error, check if enough time has passed to retry
    if (this.lastClientError) {
      const timeSinceError = Date.now() - this.lastClientError.getTime();
      const remainingMs = this.CLIENT_RETRY_INTERVAL_MS - timeSinceError;
      
      if (timeSinceError > this.CLIENT_RETRY_INTERVAL_MS) {
        // Cooldown passed - allow retry
        console.log(`[R2] [${envLabel}] Retry interval passed - attempting to create new client`);
        console.log(`[R2] [${envLabel}] Previous error was: ${this.lastClientErrorMessage}`);
        this.lastClientError = null;
        this.lastClientErrorMessage = null;
        // Continue to client creation below
      } else {
        // Still in cooldown - throw without retry
        console.log(`[R2] [${envLabel}] Client in error state - retry in ${Math.ceil(remainingMs / 1000)}s`);
        throw new Error(`R2 client unavailable - last error: ${this.lastClientErrorMessage}. Retry in ${Math.ceil(remainingMs / 1000)}s`);
      }
    }

    if (!this.client) {
      try {
        this.clientCreationCount++;
        console.log(`[R2] [${envLabel}] Creating S3 client (attempt #${this.clientCreationCount})`);
        this.client = getR2Client();
        console.log(`[R2] [${envLabel}] ✓ S3 client created successfully`);
      } catch (error: any) {
        this.lastClientError = new Date();
        this.lastClientErrorMessage = error.message || String(error);
        console.error(`[R2] [${envLabel}] ❌ Failed to create S3 client: ${this.lastClientErrorMessage}`);
        console.error(`[R2] [${envLabel}] Will retry after ${this.CLIENT_RETRY_INTERVAL_MS / 1000}s`);
        throw error;
      }
    }
    return this.client;
  }

  resetClient(): void {
    const wasConfigured = this.client !== null;
    this.client = null;
    this.lastClientError = null;
    this.lastClientErrorMessage = null;
    console.log(`[R2] Client reset (was configured: ${wasConfigured}) - will reinitialize on next request`);
  }

  getBucketName(): string {
    return R2_BUCKET_NAME;
  }

  getVtkPrefix(simulationId: number): string {
    return `vtk/${simulationId}/`;
  }

  async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType: string = "application/octet-stream"
  ): Promise<void> {
    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await client.send(command);
  }

  async getUploadUrl(
    simulationId: number,
    filename: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const client = this.getClient();
    const key = `vtk/${simulationId}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: "application/octet-stream",
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  async getDownloadUrl(
    simulationId: number,
    filename: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const client = this.getClient();
    const key = `vtk/${simulationId}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  async fileExists(simulationId: number, filename: string): Promise<boolean> {
    const client = this.getClient();
    const key = `vtk/${simulationId}/${filename}`;

    try {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });
      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async downloadToResponse(
    simulationId: number,
    filename: string,
    res: Response,
    cacheTtlSec: number = 3600
  ): Promise<void> {
    const client = this.getClient();
    const key = `vtk/${simulationId}/${filename}`;

    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Body) {
        throw new R2NotFoundError();
      }

      res.set({
        "Content-Type": response.ContentType || "application/octet-stream",
        "Content-Length": response.ContentLength?.toString() || "",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });

      const stream = response.Body as Readable;
      stream.pipe(res);
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        throw new R2NotFoundError();
      }
      throw error;
    }
  }

  async downloadToBuffer(simulationId: number, filename: string): Promise<Buffer> {
    const client = this.getClient();
    const key = `vtk/${simulationId}/${filename}`;
    const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
    const response = await client.send(command);
    if (!response.Body) throw new R2NotFoundError();
    const stream = response.Body as Readable;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async listVtkFiles(simulationId: number): Promise<string[]> {
    const client = this.getClient();
    const prefix = `vtk/${simulationId}/`;

    try {
      const command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
      });

      const response = await client.send(command);

      if (!response.Contents) {
        return [];
      }

      return response.Contents.map((obj) => {
        const key = obj.Key || "";
        return key.replace(prefix, "");
      }).filter((name) => name.length > 0);
    } catch (error) {
      console.error("Error listing VTK files from R2:", error);
      return [];
    }
  }

  async getVtkFileInfo(simulationId: number): Promise<{
    files: string[];
    totalSize: number;
    lastModified: Date | null;
  }> {
    const client = this.getClient();
    const prefix = `vtk/${simulationId}/`;

    try {
      const command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
      });

      const response = await client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return { files: [], totalSize: 0, lastModified: null };
      }

      const files = response.Contents.map((obj) => {
        const key = obj.Key || "";
        return key.replace(prefix, "");
      }).filter((name) => name.length > 0);

      const totalSize = response.Contents.reduce(
        (sum, obj) => sum + (obj.Size || 0),
        0
      );

      const lastModified = response.Contents.reduce(
        (latest, obj) => {
          if (!obj.LastModified) return latest;
          if (!latest) return obj.LastModified;
          return obj.LastModified > latest ? obj.LastModified : latest;
        },
        null as Date | null
      );

      return { files, totalSize, lastModified };
    } catch (error) {
      console.error("Error getting VTK file info from R2:", error);
      return { files: [], totalSize: 0, lastModified: null };
    }
  }
}

export const r2Storage = new R2StorageService();
