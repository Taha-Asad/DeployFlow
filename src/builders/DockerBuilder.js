"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/builders/DockerBuilder.ts
// Builds Docker images and exports them as .tar files for deployment
// ─────────────────────────────────────────────────────────────────────────────
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
exports.DockerBuilder = void 0;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const ShellUtils_1 = require("../utils/ShellUtils");
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class DockerBuilder {
    shell;
    fileUtils;
    logger;
    dockerCmd = "docker";
    constructor() {
        this.shell = new ShellUtils_1.ShellUtils();
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Resolve docker binary AND check daemon is running ─────────────────
    // VS Code installed via Flatpak can't see host /usr/bin/docker directly.
    // We try normal detection first, then fall back to flatpak-spawn --host.
    async resolveDocker() {
        const exists = await this.shell.commandExists("docker");
        if (!exists) {
            if (process.env.FLATPAK_ID || process.env.container === "flatpak") {
                const hostCheck = await this.shell.run("flatpak-spawn --host which docker");
                if (hostCheck.success) {
                    this.dockerCmd = "flatpak-spawn --host docker";
                }
                else {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        // Verify the Docker daemon is actually running
        const infoResult = await this.dockerRun("info >/dev/null 2>&1 && echo ok || echo fail");
        if (!infoResult.success || infoResult.stdout.trim() !== "ok") {
            this.logger.error("Docker daemon is not running");
            return false;
        }
        return true;
    }
    async dockerRun(cmd) {
        return this.shell.run(`${this.dockerCmd} ${cmd}`);
    }
    async dockerRunStreaming(args, options) {
        const parts = this.dockerCmd.split(" ");
        const cmd = parts[0];
        const prefix = parts.slice(1);
        return this.shell.runStreaming(cmd, [...prefix, ...args], options);
    }
    // ── Build a Docker image from the project's Dockerfile ───────────────
    async build(projectInfo, onOutput) {
        const dockerOk = await this.resolveDocker();
        if (!dockerOk) {
            const dockerBinaryExists = await this.shell.commandExists("docker");
            const errorMsg = dockerBinaryExists
                ? "Docker is installed but the Docker daemon is not running. Start it with: sudo systemctl start docker"
                : "Docker is not installed. Install Docker Desktop: https://docker.com";
            return {
                success: false,
                imageName: "",
                error: errorMsg,
            };
        }
        const imageName = this.sanitizeImageName(projectInfo.name);
        const tag = "latest";
        const fullImageName = `${imageName}:${tag}`;
        this.logger.info(`Building Docker image: ${fullImageName}`);
        onOutput(`🐳 Building Docker image: ${fullImageName}`);
        const startTime = Date.now();
        const result = await this.dockerRunStreaming(["build", "--no-cache", "--progress=plain", "-t", fullImageName, "."], {
            cwd: projectInfo.rootPath,
            onOutput: (line) => {
                if (line.trim() && !line.startsWith("#0")) {
                    onOutput(`  ${line}`);
                }
            },
            timeout: 1800000,
        });
        const duration = Math.floor((Date.now() - startTime) / 1000);
        if (!result.success) {
            this.logger.error("Docker build failed", result.stderr);
            return {
                success: false,
                imageName: fullImageName,
                error: result.stderr || result.stdout,
            };
        }
        onOutput(`✅ Docker image built in ${duration}s`);
        const imageInfo = await this.getImageInfo(fullImageName);
        this.logger.info(`Docker image built: ${fullImageName} (${imageInfo.sizeFormatted})`);
        onOutput(`📦 Image size: ${imageInfo.sizeFormatted}`);
        return {
            success: true,
            imageName: fullImageName,
            imageId: imageInfo.id,
            sizeBytes: imageInfo.size,
        };
    }
    // ── Export the Docker image as a .tar file ────────────────────────────
    async exportImage(imageName, onOutput, projectRoot) {
        const tarDir = projectRoot
            ? path.join(projectRoot, ".deployflow")
            : os.tmpdir();
        await this.fileUtils.ensureDir(tarDir);
        const tarPath = path.join(tarDir, `${imageName.replace(":", "-")}-${Date.now()}.tar`);
        this.logger.info(`Exporting image to: ${tarPath}`);
        onOutput(`💾 Exporting image to tar file...`);
        const result = await this.dockerRun(`save -o "${tarPath}" ${imageName}`);
        if (!result.success) {
            this.logger.error("Failed to export Docker image", result.stderr);
            onOutput(`❌ Failed to export image: ${result.stderr}`);
            return null;
        }
        const exists = await this.fileUtils.exists(tarPath);
        if (!exists) {
            onOutput("❌ Export failed — tar file not found");
            return null;
        }
        onOutput(`✅ Image exported: ${path.basename(tarPath)}`);
        return tarPath;
    }
    // ── Remove the temporary tar file after deployment ─────────────────────
    async cleanupTar(tarPath) {
        await this.fileUtils.deleteFile(tarPath);
        this.logger.debug(`Cleaned up temp file: ${tarPath}`);
    }
    // ── Check if an image already exists locally ──────────────────────────
    async imageExists(imageName) {
        const result = await this.dockerRun(`image inspect ${imageName}`);
        return result.success;
    }
    // ── Get image metadata ────────────────────────────────────────────────
    async getImageInfo(imageName) {
        const result = await this.dockerRun(`inspect --format="{{.Id}} {{.Size}}" ${imageName}`);
        if (!result.success) {
            return { id: "unknown", size: 0, sizeFormatted: "unknown" };
        }
        const parts = result.stdout.trim().split(" ");
        const id = parts[0]?.substring(0, 12) || "unknown";
        const sizeBytes = parseInt(parts[1] || "0");
        return {
            id,
            size: sizeBytes,
            sizeFormatted: this.formatBytes(sizeBytes),
        };
    }
    // ── Remove old Docker images to free disk space ───────────────────────
    async pruneOldImages(appName, keepCount = 3) {
        try {
            const result = await this.dockerRun(`images ${appName} --format "{{.Tag}} {{.ID}}" --no-trunc`);
            if (!result.success)
                return;
            const images = result.stdout
                .trim()
                .split("\n")
                .filter((l) => l.trim());
            const toRemove = images.slice(keepCount);
            for (const image of toRemove) {
                const imageId = image.split(" ")[1];
                await this.dockerRun(`rmi ${imageId}`);
                this.logger.debug(`Removed old image: ${imageId}`);
            }
        }
        catch (error) {
            this.logger.warn("Failed to prune old images", error);
        }
    }
    sanitizeImageName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "-")
            .replace(/^-+|-+$/g, "")
            .replace(/-+/g, "-")
            .substring(0, 128);
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }
}
exports.DockerBuilder = DockerBuilder;
//# sourceMappingURL=DockerBuilder.js.map