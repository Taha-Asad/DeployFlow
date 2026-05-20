// ─────────────────────────────────────────────────────────────────────────────
// src/core/ConfigManager.ts
// Reads and writes non-secret configuration from VS Code settings
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import * as path from "path";
import { FileUtils } from "../utils/FileUtils";
import { Logger } from "../utils/Logger";

// The shape of our deployment configuration
// This is what gets saved to .deployflow/config.json in the project
export interface DeployConfig {
  target: "vps" | "vercel" | "netlify" | "cloudflare" | "aws" | "gcp" | "azure";
  domain?: string; // e.g., "myapp.com"
  appName?: string; // e.g., "my-app"
  containerPort?: number; // Port the app runs on inside Docker
  enableSsl?: boolean; // Whether to set up HTTPS
  enableMonitoring?: boolean;
  enableKubernetes?: boolean;
  region?: string; // For cloud providers: 'us-east-1', etc.
  projectId?: string; // For GCP
  resourceGroup?: string; // For Azure
  lastDeployedUrl?: string; // URL from the last successful deployment
  lastDeployedAt?: string; // ISO timestamp of last deployment
  publishDir?: string; // Override the auto-detected publish directory (e.g. "build", "dist", ".next")
}

export class ConfigManager {
  private context: vscode.ExtensionContext;
  private fileUtils: FileUtils;
  private logger: Logger;

  // Cache the config so we don't re-read it every time
  // `Map` is like an object but better for dynamic keys
  private configCache: Map<string, DeployConfig> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.fileUtils = new FileUtils();
    this.logger = Logger.getInstance();
  }

  // ── Get a setting from VS Code's settings ────────────────────────────
  // `vscode.workspace.getConfiguration('deployflow')` gets all settings
  // that start with 'deployflow.' from the user's settings.json
  public get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration("deployflow");
    // `.get<T>` reads the setting; if not found, returns defaultValue
    return config.get<T>(key, defaultValue);
  }

  // ── Convenience getters for common settings ───────────────────────────

  public getAiProvider(): "ollama" | "openai" | "anthropic" | "gemini" {
    return this.get("aiProvider", "ollama");
  }

  public getOllamaUrl(): string {
    return this.get("ollamaUrl", "http://localhost:11434");
  }

  public getOllamaModel(): string {
    return this.get("ollamaModel", "codellama");
  }

  public getDefaultTarget(): string {
    return this.get("defaultTarget", "vps");
  }

  public getMaxFixAttempts(): number {
    return this.get("maxFixAttempts", 3);
  }

  public isTrivyScanEnabled(): boolean {
    return this.get("enableTrivyScan", true);
  }

  public isMonitoringEnabled(): boolean {
    return this.get("enableMonitoring", false);
  }

  public isKubernetesEnabled(): boolean {
    return this.get("enableKubernetes", false);
  }

  // ── Get the currently open project folder ────────────────────────────
  // Returns the path to the folder the user has open in VS Code
  public getWorkspaceFolder(): string | null {
    // `vscode.workspace.workspaceFolders` is an array of open folders
    // Most of the time there's just one
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    // `.uri.fsPath` converts VS Code's URI to a normal file path
    return folders[0].uri.fsPath;
  }

  // ── Load deployment config for the current project ────────────────────
  // We store config in `.deployflow/config.json` inside the project folder
  public async loadDeployConfig(): Promise<DeployConfig | null> {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      return null;
    }

    // Check the in-memory cache first
    const cached = this.configCache.get(workspaceFolder);
    if (cached) {
      return cached;
    }

    // Look for the config file in the project
    const configPath = path.join(workspaceFolder, ".deployflow", "config.json");
    const config = await this.fileUtils.readJson<DeployConfig>(configPath);

    if (config) {
      this.configCache.set(workspaceFolder, config);
    }

    return config;
  }

  // ── Save deployment config for the current project ────────────────────
  public async saveDeployConfig(config: DeployConfig): Promise<void> {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }

    const configPath = path.join(workspaceFolder, ".deployflow", "config.json");

    // Pretty-print JSON with 2-space indentation
    await this.fileUtils.writeFile(configPath, JSON.stringify(config, null, 2));

    // Update the cache
    this.configCache.set(workspaceFolder, config);

    this.logger.info("Deploy config saved");
  }

  // ── Get path to the .deployflow folder ───────────────────────────────
  public getDeployFlowDir(): string | null {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      return null;
    }
    return path.join(workspaceFolder, ".deployflow");
  }

  // ── Get path to error logs folder ────────────────────────────────────
  public getErrorLogsDir(): string | null {
    const dir = this.getDeployFlowDir();
    if (!dir) {
      return null;
    }
    return path.join(dir, "error-logs");
  }

  // ── Get path to snapshots folder ─────────────────────────────────────
  public getSnapshotsDir(): string | null {
    const dir = this.getDeployFlowDir();
    if (!dir) {
      return null;
    }
    return path.join(dir, "snapshots");
  }
}
