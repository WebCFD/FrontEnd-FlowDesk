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
  private readonly CLIENT_RETRY_INTERVAL_MS = 30000; // Retry after 30 seconds on error

  private getClient(): S3Client {
    // If we had an error, check if enough time has passed to retry
    if (this.lastClientError && this.client) {
      const timeSinceError = Date.now() - this.lastClientError.getTime();
      if (timeSinceError > this.CLIENT_RETRY_INTERVAL_MS) {
        console.log('[R2] Retrying client creation after previous error');
        this.client = null;
        this.lastClientError = null;
      }
    }

    if (!this.client) {
      try {
        this.client = getR2Client();
      } catch (error) {
        this.lastClientError = new Date();
        throw error;
      }
    }
    return this.client;
  }

  resetClient(): void {
    this.client = null;
    this.lastClientError = null;
    console.log('[R2] Client reset - will reinitialize on next request');
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
