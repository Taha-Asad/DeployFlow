// ────────────────────────────────────────────────────────────────────────────
// src/deployers/VercelDeployer.ts
// Deploy to Vercel using the Vercel CLI or REST API
// ────────────────────────────────────────────────────────────────────────────

import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";

export class VercelDeployer extends BaseDeployer {
  private shell: ShellUtils;

  constructor() {
    super();
    this.shell = new ShellUtils();
  }

  public async deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: Record<string, string>,
    onProgress: (msg: string) => void,
  ): Promise<DeployResult> {
    try {
      this.validateCredentials(credentials, ["VERCEL_TOKEN"]);

      const token = credentials["VERCEL_TOKEN"];
      const appName = config.appName || projectInfo.name;

      // ── 1. Check Vercel CLI is installed ───────────────────────────────
      const cliExists = await this.shell.commandExists("vercel");
      if (!cliExists) {
        onProgress("📦 Installing Vercel CLI...");
        const install = await this.shell.run("npm install -g vercel");
        if (!install.success) {
          throw new Error(`Failed to install Vercel CLI: ${install.stderr}`);
        }
      }

      // ── 2. Deploy ──────────────────────────────────────────────────────
      onProgress("🚀 Deploying to Vercel...");

      const args = [
        "--token",
        token,
        "--name",
        appName,
        "--yes", // Skip confirmation prompts
        "--prod", // Deploy to production
      ];

      if (config.domain) {
        args.push("--alias", config.domain);
      }

      const result = await this.shell.runStreaming("vercel", args, {
        cwd: projectInfo.rootPath,
        onOutput: (line) => onProgress(`  ${line}`),
        timeout: 300000, // 5 minutes
      });

      if (!result.success) {
        throw new Error(result.stderr || "Vercel deployment failed");
      }

      // Extract deployment URL from output
      const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
      const deployedUrl = urlMatch?.[0] || `https://${appName}.vercel.app`;

      onProgress(`✅ Deployed to Vercel: ${deployedUrl}`);

      await this.waitForDeployment(deployedUrl, onProgress);

      return { success: true, url: deployedUrl };
    } catch (error) {
      return this.errorResult(error);
    }
  }
}
