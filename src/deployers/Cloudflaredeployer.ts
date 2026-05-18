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

      // ── 2. Deploy to Cloudflare Pages ─────────────────────────────────
      onProgress("🚀 Deploying to Cloudflare Pages...");

      const publishDir = projectInfo.type === "frontend" ? "dist" : ".";

      const env: Record<string, string> = {
        CLOUDFLARE_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      };

      const result = await this.shell.runStreaming(
        "wrangler",
        [
          "pages",
          "deploy",
          path.join(projectInfo.rootPath, publishDir),
          "--project-name",
          projectName,
          "--commit-dirty=true",
        ],
        {
          cwd: projectInfo.rootPath,
          env,
          onOutput: (line) => onProgress(`  ${line}`),
          timeout: 300000,
        },
      );

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
}
