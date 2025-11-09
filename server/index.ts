import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Log environment with detailed information
const nodeEnv = process.env.NODE_ENV || 'development';
log(`========================================`);
log(`Starting server in ${nodeEnv} mode`);
log(`Node version: ${process.version}`);
log(`Platform: ${process.platform}`);
log(`CWD: ${process.cwd()}`);
log(`========================================`);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    log("Initializing server...");
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      log(`Error occurred: ${status} - ${message}`);
      res.status(status).json({ message });
      console.error(err);
    });

    // Default to development mode unless explicitly set to production
    if (nodeEnv !== "production") {
      log("Setting up Vite for development...");
      await setupVite(app, server);
      log("Vite setup completed successfully");
    } else {
      log("Setting up static serving for production...");
      try {
        serveStatic(app);
        log("Static serving setup completed successfully");
      } catch (staticError: any) {
        console.error("Failed to setup static serving:", staticError);
        console.error("Error details:", staticError.message);
        throw staticError; // Re-throw to be caught by outer try-catch
      }
    }

    const PORT = 5000;
    const HOST = "0.0.0.0";
    
    log(`Attempting to bind server to ${HOST}:${PORT}...`);
    
    server.listen(PORT, HOST, () => {
      log(`✅ Server successfully started`);
      log(`   - Host: ${HOST}`);
      log(`   - Port: ${PORT}`);
      log(`   - Mode: ${nodeEnv}`);
      log(`   - Process PID: ${process.pid}`);
      log(`========================================`);
      log(`Server is ready to accept connections`);
    });

    // Add error handler for server listen failures
    server.on('error', (error: any) => {
      console.error("Server failed to start:", error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error("========================================");
    console.error("CRITICAL ERROR during server initialization");
    console.error("========================================");
    console.error("Error:", error);
    console.error("Error message:", (error as Error).message);
    console.error("Error stack:", (error as Error).stack);
    console.error("========================================");
    process.exit(1); // Exit on critical initialization errors
  }
})();