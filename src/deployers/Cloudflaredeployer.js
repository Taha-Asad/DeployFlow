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
            // Resolve wrangler binary path
            const wranglerPath = await this.resolveWranglerPath();
            // ── 2. Determine publish directory ────────────────────────────────
            const publishDir = projectInfo.type === "frontend" ? "dist" : ".";
            const publishPath = path.join(projectInfo.rootPath, publishDir);
            onProgress(`📁 Publish directory: "${publishDir}"`);
            onProgress(`🔗 Full deploy path: "${publishPath}"`);
            // ── 3. Deploy to Cloudflare Pages ─────────────────────────────────
            onProgress(`🚀 Deploying to Cloudflare Pages as "${projectName}"...`);
            const env = {
                CLOUDFLARE_API_TOKEN: apiToken,
                CLOUDFLARE_ACCOUNT_ID: accountId,
            };
            let result = await this.runWranglerDeploy(wranglerPath, publishPath, projectName, env, projectInfo, onProgress);
            // If project doesn't exist, create it and retry
            if (!result.success && this.isProjectNotFoundError(result.stderr)) {
                onProgress(`📦 Project "${projectName}" not found — creating it...`);
                const createResult = await this.runWranglerCreate(wranglerPath, projectName, env, onProgress);
                if (!createResult.success) {
                    throw new Error(
                        `Failed to create Cloudflare Pages project "${projectName}": ${createResult.stderr}`
                    );
                }
                onProgress(`✅ Project "${projectName}" created`);
                result = await this.runWranglerDeploy(wranglerPath, publishPath, projectName, env, projectInfo, onProgress);
            }
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
    async resolveWranglerPath() {
        const result = await this.shell.run("which wrangler");
        if (result.success && result.stdout.trim()) {
            return result.stdout.trim();
        }
        return "wrangler";
    }
    isProjectNotFoundError(stderr) {
        return (stderr.includes("Project not found") ||
            stderr.includes("code: 8000007") ||
            stderr.includes("does not match any of your existing projects"));
    }
    async runWranglerDeploy(wranglerPath, publishPath, projectName, env, projectInfo, onProgress) {
        const args = [
            "pages",
            "deploy",
            publishPath,
            "--project-name",
            projectName,
            "--commit-dirty=true",
        ];
        onProgress(`⚙️ Running: wrangler ${args.join(" ")}`);
        return await this.shell.runStreaming(wranglerPath, args, {
            cwd: projectInfo.rootPath,
            env,
            onOutput: (line) => onProgress(`  ${line}`),
            timeout: 300000,
        });
    }
    async runWranglerCreate(wranglerPath, projectName, env, onProgress) {
        const args = [
            "pages",
            "project",
            "create",
            projectName,
            "--production-branch",
            "main",
        ];
        onProgress(`⚙️ Running: wrangler ${args.join(" ")}`);
        return await this.shell.runStreaming(wranglerPath, args, {
            env,
            onOutput: (line) => onProgress(`  ${line}`),
            timeout: 60000,
        });
    }
}
exports.CloudflareDeployer = CloudflareDeployer;
//# sourceMappingURL=Cloudflaredeployer.js.map
