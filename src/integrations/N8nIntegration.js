"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/integrations/N8nIntegration.ts
// Triggers n8n workflows on deployment events
// n8n is an open-source workflow automation tool (like Zapier but self-hosted)
// ────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nIntegration = void 0;
const NetworkUtils_1 = require("../utils/NetworkUtils");
const Logger_1 = require("../utils/Logger");
class N8nIntegration {
    config = null;
    networkUtils;
    logger;
    constructor() {
        this.networkUtils = new NetworkUtils_1.NetworkUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Configure the n8n webhook endpoint ────────────────────────────────────
    configure(config) {
        this.config = config;
        this.logger.info(`n8n integration configured: ${config.webhookUrl}`);
    }
    // ── Fire a deployment event to n8n ────────────────────────────────────────
    async trigger(event) {
        if (!this.config) {
            this.logger.debug("n8n not configured — skipping webhook trigger");
            return false;
        }
        this.logger.info(`Triggering n8n webhook: ${event.type} for ${event.appName}`);
        const headers = {
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
            const response = await this.networkUtils.post(this.config.webhookUrl, payload, headers);
            if (response !== null) {
                this.logger.info(`n8n webhook triggered successfully for ${event.type}`);
                return true;
            }
            else {
                this.logger.warn(`n8n webhook call returned null for ${event.type}`);
                return false;
            }
        }
        catch (error) {
            this.logger.warn("n8n webhook failed", error);
            return false;
        }
    }
    // ── Convenience methods for common events ─────────────────────────────────
    async onDeployStarted(appName, target) {
        await this.trigger({
            type: "deploy_started",
            appName,
            target,
            timestamp: new Date().toISOString(),
        });
    }
    async onDeploySuccess(appName, target, url) {
        await this.trigger({
            type: "deploy_success",
            appName,
            target,
            url,
            timestamp: new Date().toISOString(),
        });
    }
    async onDeployFailed(appName, target, error) {
        await this.trigger({
            type: "deploy_failed",
            appName,
            target,
            error,
            timestamp: new Date().toISOString(),
        });
    }
    async onScanWarning(appName, criticalCount, highCount) {
        await this.trigger({
            type: "scan_warning",
            appName,
            target: "security-scan",
            timestamp: new Date().toISOString(),
            metadata: { criticalCount, highCount },
        });
    }
    // ── Check if n8n webhook is reachable ─────────────────────────────────────
    async testConnection() {
        if (!this.config)
            return false;
        const result = await this.networkUtils.get(this.config.webhookUrl.replace("/webhook/", "/health"));
        return result !== null;
    }
}
exports.N8nIntegration = N8nIntegration;
//# sourceMappingURL=N8nIntegration.js.map