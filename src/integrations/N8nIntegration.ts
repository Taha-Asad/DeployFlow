// ────────────────────────────────────────────────────────────────────────────
// src/integrations/N8nIntegration.ts
// Triggers n8n workflows on deployment events
// n8n is an open-source workflow automation tool (like Zapier but self-hosted)
// ────────────────────────────────────────────────────────────────────────────

import { NetworkUtils } from "../utils/NetworkUtils";
import { Logger } from "../utils/Logger";

export interface N8nConfig {
  webhookUrl: string; // The n8n webhook URL to call
  apiKey?: string; // Optional API key for secured webhooks
}

export interface DeploymentEvent {
  type: "deploy_started" | "deploy_success" | "deploy_failed" | "scan_warning";
  appName: string;
  target: string;
  timestamp: string;
  url?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class N8nIntegration {
  private config: N8nConfig | null = null;
  private networkUtils: NetworkUtils;
  private logger: Logger;

  constructor() {
    this.networkUtils = new NetworkUtils();
    this.logger = Logger.getInstance();
  }

  // ── Configure the n8n webhook endpoint ────────────────────────────────────
  public configure(config: N8nConfig): void {
    this.config = config;
    this.logger.info(`n8n integration configured: ${config.webhookUrl}`);
  }

  // ── Fire a deployment event to n8n ────────────────────────────────────────
  public async trigger(event: DeploymentEvent): Promise<boolean> {
    if (!this.config) {
      this.logger.debug("n8n not configured — skipping webhook trigger");
      return false;
    }

    this.logger.info(
      `Triggering n8n webhook: ${event.type} for ${event.appName}`,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["X-N8N-API-KEY"] = this.config.apiKey;
    }

    const payload = {
      ...event,
      source: "deployflow-ai",
    };

    try {
      const response = await this.networkUtils.post(
        this.config.webhookUrl,
        payload,
        headers,
      );

      if (response !== null) {
        this.logger.info(
          `n8n webhook triggered successfully for ${event.type}`,
        );
        return true;
      } else {
        this.logger.warn(`n8n webhook call returned null for ${event.type}`);
        return false;
      }
    } catch (error) {
      this.logger.warn("n8n webhook failed", error);
      return false;
    }
  }

  // ── Convenience methods for common events ─────────────────────────────────

  public async onDeployStarted(appName: string, target: string): Promise<void> {
    await this.trigger({
      type: "deploy_started",
      appName,
      target,
      timestamp: new Date().toISOString(),
    });
  }

  public async onDeploySuccess(
    appName: string,
    target: string,
    url?: string,
  ): Promise<void> {
    await this.trigger({
      type: "deploy_success",
      appName,
      target,
      url,
      timestamp: new Date().toISOString(),
    });
  }

  public async onDeployFailed(
    appName: string,
    target: string,
    error: string,
  ): Promise<void> {
    await this.trigger({
      type: "deploy_failed",
      appName,
      target,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  public async onScanWarning(
    appName: string,
    criticalCount: number,
    highCount: number,
  ): Promise<void> {
    await this.trigger({
      type: "scan_warning",
      appName,
      target: "security-scan",
      timestamp: new Date().toISOString(),
      metadata: { criticalCount, highCount },
    });
  }

  // ── Check if n8n webhook is reachable ─────────────────────────────────────
  public async testConnection(): Promise<boolean> {
    if (!this.config) return false;

    const result = await this.networkUtils.get(
      this.config.webhookUrl.replace("/webhook/", "/health"),
    );

    return result !== null;
  }
}
