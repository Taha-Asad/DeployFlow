// ────────────────────────────────────────────────────────────────────────────
// src/deployers/BaseDeployer.ts
// Abstract base class that all deployers extend.
// Contains shared utilities: progress reporting, health checks, snapshot logic.
// ────────────────────────────────────────────────────────────────────────────

import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { NetworkUtils } from "../utils/NetworkUtils";
import { Logger } from "../utils/Logger";

export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
  deploymentId?: string; // Platform-specific deployment ID for rollbacks
}

export abstract class BaseDeployer {
  protected logger: Logger;
  protected networkUtils: NetworkUtils;

  constructor() {
    this.logger = Logger.getInstance();
    this.networkUtils = new NetworkUtils();
  }

  // ── Abstract method — each deployer must implement this ──────────────────
  public abstract deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: Record<string, string>,
    onProgress: (msg: string) => void,
  ): Promise<DeployResult>;

  // ── Wait for a URL to return 200 ────────────────────────────────────────
  protected async waitForDeployment(
    url: string,
    onProgress: (msg: string) => void,
    maxAttempts = 30,
    delayMs = 5000,
  ): Promise<boolean> {
    onProgress(`🏥 Waiting for ${url} to become healthy...`);
    const healthy = await this.networkUtils.waitForHealthy(
      url,
      maxAttempts,
      delayMs,
    );
    if (healthy) {
      onProgress(`✅ ${url} is healthy`);
    } else {
      onProgress(`❌ Health check timed out for ${url}`);
    }
    return healthy;
  }

  // ── Validate required credential keys ────────────────────────────────────
  protected validateCredentials(
    credentials: Record<string, string>,
    required: string[],
  ): void {
    const missing = required.filter((k) => !credentials[k]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required credentials: ${missing.join(", ")}. ` +
          `Run "Configure DeployFlow" to set them.`,
      );
    }
  }

  // ── Build a standard error result ────────────────────────────────────────
  protected errorResult(error: unknown): DeployResult {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error("Deployment failed", error);
    return { success: false, error: message };
  }
}
