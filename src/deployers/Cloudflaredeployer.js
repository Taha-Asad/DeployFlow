"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/deployers/CloudflareDeployer.ts
// Deploy static sites to Cloudflare Pages, or workers via Wrangler CLI
// ────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudflareDeployer = void 0;
const path = __importStar(require("path"));
const BaseDeployer_1 = require("./BaseDeployer");
const ShellUtils_1 = require("../utils/ShellUtils");
const FileUtils_1 = require("../utils/FileUtils");
class CloudflareDeployer extends BaseDeployer_1.BaseDeployer {
    shell;
    fileUtils;
    constructor() {
        super();
        this.shell = new ShellUtils_1.ShellUtils();
        this.fileUtils = new FileUtils_1.FileUtils();
    }
    async deploy(projectInfo, config, credentials, onProgress) {
        try {
            this.validateCredentials(credentials, [
                "CLOUDFLARE_API_TOKEN",
                "CLOUDFLARE_ACCOUNT_ID",
            ]);
            const apiToken = credentials["CLOUDFLARE_API_TOKEN"];
            const accountId = credentials["CLOUDFLARE_ACCOUNT_ID"];
            const projectName = (config.appName || projectInfo.name)
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-");
            // ── 1. Ensure Wrangler CLI ─────────────────────────────────────────
            const wranglerExists = await this.shell.commandExists("wrangler");
            if (!wranglerExists) {
                onProgress("📦 Installing Wrangler CLI...");
                await this.shell.run("npm install -g wrangler");
            }
            // ── 2. Deploy to Cloudflare Pages ─────────────────────────────────
            onProgress("🚀 Deploying to Cloudflare Pages...");
            const publishDir = projectInfo.type === "frontend" ? "dist" : ".";
            const env = {
                CLOUDFLARE_API_TOKEN: apiToken,
                CLOUDFLARE_ACCOUNT_ID: accountId,
            };
            const result = await this.shell.runStreaming("wrangler", [
                "pages",
                "deploy",
                path.join(projectInfo.rootPath, publishDir),
                "--project-name",
                projectName,
                "--commit-dirty=true",
            ], {
                cwd: projectInfo.rootPath,
                env,
                onOutput: (line) => onProgress(`  ${line}`),
                timeout: 300000,
            });
            if (!result.success) {
                throw new Error(result.stderr || "Cloudflare Pages deployment failed");
            }
            const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
            const deployedUrl = urlMatch?.[0] || `https://${projectName}.pages.dev`;
            onProgress(`✅ Deployed to Cloudflare Pages: ${deployedUrl}`);
            await this.waitForDeployment(deployedUrl, onProgress);
            return { success: true, url: deployedUrl };
        }
        catch (error) {
            return this.errorResult(error);
        }
    }
}
exports.CloudflareDeployer = CloudflareDeployer;
//# sourceMappingURL=Cloudflaredeployer.js.map