// ────────────────────────────────────────────────────────────────────────────
// src/deployers/NetlifyDeployer.ts
// Deploy to Netlify via the Netlify CLI
// ────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";

export class NetlifyDeployer extends BaseDeployer {
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

      const env: Record<string, string> = { NETLIFY_AUTH_TOKEN: token };
      if (siteId) env["NETLIFY_SITE_ID"] = siteId;

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
      const deployedUrl =
        urlMatch?.[1] ||
        `https://${config.appName || projectInfo.name}.netlify.app`;

      onProgress(`✅ Deployed to Netlify: ${deployedUrl}`);
      await this.waitForDeployment(deployedUrl, onProgress);

      return { success: true, url: deployedUrl };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private getPublishDir(info: ProjectInfo): string {
    if (info.framework === "react-cra") return "build";
    if (info.type === "frontend") return "dist";
    return "dist";
  }
}
