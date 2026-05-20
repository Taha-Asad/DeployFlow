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
const FileUtils_1 = require("../utils/FileUtils");
class NetlifyDeployer extends BaseDeployer_1.BaseDeployer {
    shell;
    fileUtils;
    constructor() {
        super();
        this.shell = new ShellUtils_1.ShellUtils();
        this.fileUtils = new FileUtils_1.FileUtils();
    }
    async deploy(projectInfo, config, credentials, onProgress) {
        try {
            this.validateCredentials(credentials, ["NETLIFY_AUTH_TOKEN"]);
            const token = credentials["NETLIFY_AUTH_TOKEN"];
            const siteId = credentials["NETLIFY_SITE_ID"];
            // ── 1. Ensure Netlify CLI ──────────────────────────────────────────
            const cliExists = await this.shell.commandExists("netlify");
            if (!cliExists) {
                onProgress("📦 Installing Netlify CLI...");
                await this.shell.run("npm install -g netlify-cli");
            }
            // ── 2. Determine publish directory ────────────────────────────────
            const publishDir = await this.getPublishDir(projectInfo, config);
            const publishPath = path.join(projectInfo.rootPath, publishDir);
            onProgress(`📁 Publish directory: "${publishDir}"`);
            onProgress(`📂 Project root: "${projectInfo.rootPath}"`);
            onProgress(`🔗 Full deploy path: "${publishPath}"`);
            this.logger.info(`Netlify deploy: framework=${projectInfo.framework} type=${projectInfo.type}`);
            this.logger.info(`Netlify deploy: publishDir="${publishDir}" publishPath="${publishPath}"`);
            // ── 2b. Verify publish directory exists ────────────────────────────
            if (!(await this.fileUtils.exists(publishPath))) {
                throw new Error(
                    `Publish directory "${publishDir}" not found at "${publishPath}". ` +
                    `Detected framework: ${projectInfo.framework} (${projectInfo.type}). ` +
                    `The build step may not have produced the expected output directory. ` +
                    `Run the build command ("${projectInfo.buildCommand}") first, or set a custom ` +
                    `publish directory via the DeployFlow config (publishDir field in .deployflow/config.json).`
                );
            }
            // ── 3. Deploy ──────────────────────────────────────────────────────
            onProgress("🚀 Deploying to Netlify...");
            // Resolve full path to netlify CLI (needed when running without shell)
            const netlifyPath = await this.resolveNetlifyPath();
            onProgress(`  (netlify binary: ${netlifyPath})`);
            const env = { NETLIFY_AUTH_TOKEN: token };
            if (siteId)
                env["NETLIFY_SITE_ID"] = siteId;
            const args = [
                "deploy",
                "--prod",
                "--no-build",
                "--dir",
                publishPath,
            ];
            onProgress(`⚙️ Running: netlify ${args.join(" ")}`);
            onProgress(`  (publishPath="${publishPath}")`);
            const result = await this.shell.runStreaming(netlifyPath, args, {
                cwd: projectInfo.rootPath,
                env,
                onOutput: (line) => onProgress(`  ${line}`),
                timeout: 300000,
                useShell: false,
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
    async getPublishDir(info, config) {
        // 1. User-configured override takes precedence
        if (config.publishDir) {
            return config.publishDir;
        }
        // 2. Check netlify.toml for [build] publish setting
        const tomlDir = await this.readPublishDirFromToml(info.rootPath);
        if (tomlDir) {
            return tomlDir;
        }
        // 3. Framework-specific maps
        const frameworkMap = {
            "react-cra":   "build",
            "react-vite":  "dist",
            "react":       "build",
            "vue-vite":    "dist",
            "vue-cli":     "dist",
            "angular":     "dist",
            "svelte":      "dist",
            "sveltekit":   "build",
            "vite":        "dist",
            "nextjs":      ".next",
            "nuxtjs":      ".output",
            "nestjs":      "dist",
            "express":     "dist",
        };
        if (frameworkMap[info.framework]) {
            return frameworkMap[info.framework];
        }
        // 4. Fallback by project type
        if (info.type === "frontend") return "dist";
        if (info.type === "fullstack") return "dist";
        // 5. Last resort
        return "dist";
    }
    async resolveNetlifyPath() {
        const result = await this.shell.run("which netlify");
        if (result.success && result.stdout.trim()) {
            return result.stdout.trim();
        }
        return "netlify";
    }
    async readPublishDirFromToml(rootPath) {
        const tomlPath = path.join(rootPath, "netlify.toml");
        const content = await this.fileUtils.readFile(tomlPath);
        if (!content) return null;
        // Simple TOML parser for [build] publish field
        const buildSection = content.match(/\[build\]\s*\n([\s\S]*?)(?=\[|\s*$)/);
        if (!buildSection) return null;
        const buildBody = buildSection[1];
        const publishMatch = buildBody.match(/publish\s*=\s*"([^"]+)"/);
        if (!publishMatch) return null;
        const dir = publishMatch[1].trim();
        return dir || null;
    }
}
exports.NetlifyDeployer = NetlifyDeployer;
//# sourceMappingURL=Netlifydeployer.js.map
