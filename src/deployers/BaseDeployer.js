"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/deployers/BaseDeployer.ts
// Abstract base class that all deployers extend.
// Contains shared utilities: progress reporting, health checks, snapshot logic.
// ────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseDeployer = void 0;
const NetworkUtils_1 = require("../utils/NetworkUtils");
const Logger_1 = require("../utils/Logger");
class BaseDeployer {
    logger;
    networkUtils;
    constructor() {
        this.logger = Logger_1.Logger.getInstance();
        this.networkUtils = new NetworkUtils_1.NetworkUtils();
    }
    // ── Wait for a URL to return 200 ────────────────────────────────────────
    async waitForDeployment(url, onProgress, maxAttempts = 30, delayMs = 5000) {
        onProgress(`🏥 Waiting for ${url} to become healthy...`);
        const healthy = await this.networkUtils.waitForHealthy(url, maxAttempts, delayMs);
        if (healthy) {
            onProgress(`✅ ${url} is healthy`);
        }
        else {
            onProgress(`❌ Health check timed out for ${url}`);
        }
        return healthy;
    }
    // ── Validate required credential keys ────────────────────────────────────
    validateCredentials(credentials, required) {
        const missing = required.filter((k) => !credentials[k]);
        if (missing.length > 0) {
            throw new Error(`Missing required credentials: ${missing.join(", ")}. ` +
                `Run "Configure DeployFlow" to set them.`);
        }
    }
    // ── Build a standard error result ────────────────────────────────────────
    errorResult(error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("Deployment failed", error);
        return { success: false, error: message };
    }
}
exports.BaseDeployer = BaseDeployer;
//# sourceMappingURL=BaseDeployer.js.map