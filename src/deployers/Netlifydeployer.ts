// ────────────────────────────────────────────────────────────────────────────
// src/deployers/NetlifyDeployer.ts
// Deploy to Netlify via the Netlify CLI
// ────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";
import { FileUtils } from "../utils/FileUtils";

export class NetlifyDeployer extends BaseDeployer {
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
      const publishDir = await this.getPublishDir(projectInfo, config);
      const publishPath = path.join(projectInfo.rootPath, publishDir);
      onProgress(`📁 Publish directory: "${publishDir}"`);
      onProgress(`📂 Project root: "${projectInfo.rootPath}"`);
      onProgress(`🔗 Full deploy path: "${publishPath}"`);

      // Log what we detected for debugging
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

      const env: Record<string, string> = { NETLIFY_AUTH_TOKEN: token };
      if (siteId) env["NETLIFY_SITE_ID"] = siteId;

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

  private async getPublishDir(info: ProjectInfo, config: DeployConfig): Promise<string> {
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
    // Build output directories commonly used by each framework
    const frameworkMap: Record<string, string> = {
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

  private async resolveNetlifyPath(): Promise<string> {
    // First try: check if 'netlify' is directly available
    const result = await this.shell.run("which netlify");
    if (result.success && result.stdout.trim()) {
      return result.stdout.trim();
    }
    // Fallback: use command name directly (system PATH)
    return "netlify";
  }

  private async readPublishDirFromToml(rootPath: string): Promise<string | null> {
    const tomlPath = path.join(rootPath, "netlify.toml");
    const content = await this.fileUtils.readFile(tomlPath);
    if (!content) return null;

    // Simple TOML parser for [build] publish field
    // Matches: [build]\n...\npublish = "value"
    const buildSection = content.match(/\[build\]\s*\n([\s\S]*?)(?=\[|\s*$)/);
    if (!buildSection) return null;

    const buildBody = buildSection[1];
    const publishMatch = buildBody.match(/publish\s*=\s*"([^"]+)"/);
    if (!publishMatch) return null;

    const dir = publishMatch[1].trim();
    return dir || null;
  }
}
