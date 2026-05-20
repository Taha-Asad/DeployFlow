// ────────────────────────────────────────────────────────────────────────────
// src/deployers/CloudflareDeployer.ts
// Deploy static sites to Cloudflare Pages, or workers via Wrangler CLI
// ────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";
import { FileUtils } from "../utils/FileUtils";

export class CloudflareDeployer extends BaseDeployer {
  private shell: ShellUtils;
  private fileUtils: FileUtils;

  constructor() {
    super();
    this.shell = new ShellUtils();
    this.fileUtils = new FileUtils();
  }

  public async deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: Record<string, string>,
    onProgress: (msg: string) => void,
  ): Promise<DeployResult> {
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

      const env: Record<string, string> = {
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
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async resolveWranglerPath(): Promise<string> {
    const result = await this.shell.run("which wrangler");
    if (result.success && result.stdout.trim()) {
      return result.stdout.trim();
    }
    return "wrangler";
  }

  private isProjectNotFoundError(stderr: string): boolean {
    return (
      stderr.includes("Project not found") ||
      stderr.includes("code: 8000007") ||
      stderr.includes("does not match any of your existing projects")
    );
  }

  private async runWranglerDeploy(
    wranglerPath: string,
    publishPath: string,
    projectName: string,
    env: Record<string, string>,
    projectInfo: ProjectInfo,
    onProgress: (msg: string) => void,
  ) {
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

  private async runWranglerCreate(
    wranglerPath: string,
    projectName: string,
    env: Record<string, string>,
    onProgress: (msg: string) => void,
  ) {
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
