"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/deployers/NetlifyDeployer.ts
// Deploy to Netlify via the Netlify CLI
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
exports.NetlifyDeployer = void 0;
const path = __importStar(require("path"));
const BaseDeployer_1 = require("./BaseDeployer");
const ShellUtils_1 = require("../utils/ShellUtils");
class NetlifyDeployer extends BaseDeployer_1.BaseDeployer {
    shell;
    constructor() {
        super();
        this.shell = new ShellUtils_1.ShellUtils();
    }
    async deploy(projectInfo, config, credentials, onProgress) {
        try {
            this.validateCredentials(credentials, ["NETLIFY_AUTH_TOKEN"]);
            const token = credentials["NETLIFY_AUTH_TOKEN"];
            const siteId = credentials["NETLIFY_SITE_ID"]; // Optional — creates new site if missing
            // ── 1. Ensure Netlify CLI ──────────────────────────────────────────
            const cliExists = await this.shell.commandExists("netlify");
            if (!cliExists) {
                onProgress("📦 Installing Netlify CLI...");
                await this.shell.run("npm install -g netlify-cli");
            }
            // ── 2. Determine publish directory ────────────────────────────────
            const publishDir = this.getPublishDir(projectInfo);
            onProgress(`📁 Publish directory: ${publishDir}`);
            // ── 3. Deploy ──────────────────────────────────────────────────────
            onProgress("🚀 Deploying to Netlify...");
            const env = { NETLIFY_AUTH_TOKEN: token };
            if (siteId)
                env["NETLIFY_SITE_ID"] = siteId;
            const args = [
                "deploy",
                "--prod",
                "--dir",
                path.join(projectInfo.rootPath, publishDir),
                "--message",
                `DeployFlow AI deployment ${new Date().toISOString()}`,
            ];
            const result = await this.shell.runStreaming("netlify", args, {
                cwd: projectInfo.rootPath,
                env,
                onOutput: (line) => onProgress(`  ${line}`),
                timeout: 300000,
            });
            if (!result.success) {
                throw new Error(result.stderr || "Netlify deployment failed");
            }
            // Parse deployed URL from output
            const urlMatch = result.stdout.match(/Website URL:\s+(https:\/\/[^\s]+)/);
            const deployedUrl = urlMatch?.[1] ||
                `https://${config.appName || projectInfo.name}.netlify.app`;
            onProgress(`✅ Deployed to Netlify: ${deployedUrl}`);
            await this.waitForDeployment(deployedUrl, onProgress);
            return { success: true, url: deployedUrl };
        }
        catch (error) {
            return this.errorResult(error);
        }
    }
    getPublishDir(info) {
        if (info.framework === "react-cra")
            return "build";
        if (info.type === "frontend")
            return "dist";
        return "dist";
    }
}
exports.NetlifyDeployer = NetlifyDeployer;
//# sourceMappingURL=Netlifydeployer.js.map