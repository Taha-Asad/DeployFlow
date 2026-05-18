// ─────────────────────────────────────────────────────────────────────────────
// src/builders/DockerBuilder.ts
// Builds Docker images and exports them as .tar files for deployment
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import * as os from "os";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { ShellUtils } from "../utils/ShellUtils";
import { FileUtils } from "../utils/FileUtils";
import { Logger } from "../utils/Logger";

export interface DockerBuildResult {
  success: boolean;
  imageName: string; // e.g., "myapp:latest"
  imageId?: string; // Docker's internal image ID
  tarPath?: string; // Path to the exported .tar file
  error?: string;
  sizeBytes?: number; // Size of the image
}

export class DockerBuilder {
  private shell: ShellUtils;
  private fileUtils: FileUtils;
  private logger: Logger;
  private dockerCmd: string = "docker";

  constructor() {
    this.shell = new ShellUtils();
    this.fileUtils = new FileUtils();
    this.logger = Logger.getInstance();
  }

  // ── Resolve docker binary (handles Flatpak sandbox) ───────────────────
  // VS Code installed via Flatpak can't see host /usr/bin/docker directly.
  // We try normal detection first, then fall back to flatpak-spawn --host.
  private async resolveDocker(): Promise<boolean> {
    const exists = await this.shell.commandExists("docker");
    if (exists) return true;

    if (process.env.FLATPAK_ID || process.env.container === "flatpak") {
      const hostCheck = await this.shell.run(
        "flatpak-spawn --host which docker",
      );
      if (hostCheck.success) {
        this.dockerCmd = "flatpak-spawn --host docker";
        return true;
      }
    }

    return false;
  }

  private async dockerRun(
    cmd: string,
  ): Promise<import("../utils/ShellUtils").CommandResult> {
    return this.shell.run(`${this.dockerCmd} ${cmd}`);
  }

  private async dockerRunStreaming(
    args: string[],
    options?: import("../utils/ShellUtils").CommandOptions,
  ): Promise<import("../utils/ShellUtils").CommandResult> {
    const parts = this.dockerCmd.split(" ");
    const cmd = parts[0];
    const prefix = parts.slice(1);
    return this.shell.runStreaming(cmd, [...prefix, ...args], options);
  }

  // ── Build a Docker image from the project's Dockerfile ───────────────
  public async build(
    projectInfo: ProjectInfo,
    onOutput: (line: string) => void,
  ): Promise<DockerBuildResult> {
    const dockerOk = await this.resolveDocker();
    if (!dockerOk) {
      return {
        success: false,
        imageName: "",
        error:
          "Docker is not installed. Install Docker Desktop: https://docker.com",
      };
    }

    const imageName = this.sanitizeImageName(projectInfo.name);
    const tag = "latest";
    const fullImageName = `${imageName}:${tag}`;

    this.logger.info(`Building Docker image: ${fullImageName}`);
    onOutput(`🐳 Building Docker image: ${fullImageName}`);

    const startTime = Date.now();

    const result = await this.dockerRunStreaming(
      ["build", "--no-cache", "--progress=plain", "-t", fullImageName, "."],
      {
        cwd: projectInfo.rootPath,
        onOutput: (line) => {
          if (line.trim() && !line.startsWith("#0")) {
            onOutput(`  ${line}`);
          }
        },
        timeout: 1800000,
      },
    );

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

    this.logger.info(
      `Docker image built: ${fullImageName} (${imageInfo.sizeFormatted})`,
    );
    onOutput(`📦 Image size: ${imageInfo.sizeFormatted}`);

    return {
      success: true,
      imageName: fullImageName,
      imageId: imageInfo.id,
      sizeBytes: imageInfo.size,
    };
  }

  // ── Export the Docker image as a .tar file ────────────────────────────
  public async exportImage(
    imageName: string,
    onOutput: (line: string) => void,
    projectRoot?: string,
  ): Promise<string | null> {
    const tarDir = projectRoot
      ? path.join(projectRoot, ".deployflow")
      : os.tmpdir();
    await this.fileUtils.ensureDir(tarDir);

    const tarPath = path.join(
      tarDir,
      `${imageName.replace(":", "-")}-${Date.now()}.tar`,
    );

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
  public async cleanupTar(tarPath: string): Promise<void> {
    await this.fileUtils.deleteFile(tarPath);
    this.logger.debug(`Cleaned up temp file: ${tarPath}`);
  }

  // ── Check if an image already exists locally ──────────────────────────
  public async imageExists(imageName: string): Promise<boolean> {
    const result = await this.dockerRun(`image inspect ${imageName}`);
    return result.success;
  }

  // ── Get image metadata ────────────────────────────────────────────────
  private async getImageInfo(
    imageName: string,
  ): Promise<{ id: string; size: number; sizeFormatted: string }> {
    const result = await this.dockerRun(
      `inspect --format="{{.Id}} {{.Size}}" ${imageName}`,
    );

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
  public async pruneOldImages(
    appName: string,
    keepCount: number = 3,
  ): Promise<void> {
    try {
      const result = await this.dockerRun(
        `images ${appName} --format "{{.Tag}} {{.ID}}" --no-trunc`,
      );

      if (!result.success) return;

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
    } catch (error) {
      this.logger.warn("Failed to prune old images", error);
    }
  }

  private sanitizeImageName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
      .substring(0, 128);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}
