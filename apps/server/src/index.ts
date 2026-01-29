import cors from "cors";
import express from "express";

import routes from "./server/routes";
import {
  errorHandler,
  conditionalRequestLogger,
} from "./server/middleware";
import { logger } from "./logger";
import { config } from "./config";
import { checkDatabaseConnection, disconnectDatabase } from "./database";

const port = config.server.port;
const app = express();

// Middleware
app.use(
  cors({
    origin: config.server.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(conditionalRequestLogger);

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    message: "Pokus Agent Server",
    status: "running",
  });
});

app.use("/api", routes);

app.use(errorHandler);

async function shutdown() {
  logger.info("Shutting down server...");
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start server
async function start() {
  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.warn("Database connection failed - server will start but some features may not work");
  } else {
    logger.info("Database connected");
  }

  app.listen(port, () => {
    logger.info(`Server is running on port: ${port}`);
    logger.info(`API available at: http://localhost:${port}/api`);
  });
}

start().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});
