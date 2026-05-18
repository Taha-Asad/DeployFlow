// ────────────────────────────────────────────────────────────────────────────
// src/commands/AnalyzeCommand.ts
// Analyzes the project and shows a summary — without deploying
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { ProjectAnalyzer } from "../core/ProjectAnalyzer";
import { ConfigManager } from "../core/ConfigManager";

export class AnalyzeCommand {
  private configManager: ConfigManager;
  private analyzer: ProjectAnalyzer;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.analyzer = new ProjectAnalyzer();
  }

  public async execute(): Promise<void> {
    const workspaceFolder = this.configManager.getWorkspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No folder open. Please open a project first.",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "🔍 Analyzing project...",
        cancellable: false,
      },
      async () => {
        const info = await this.analyzer.analyze(workspaceFolder);

        const lines = [
          `**Framework:** ${info.framework}`,
          `**Language:** ${info.language} ${info.runtimeVersion ? `(v${info.runtimeVersion})` : ""}`,
          `**Type:** ${info.type}`,
          `**Package Manager:** ${info.packageManager}`,
          `**Port:** ${info.port}`,
          `**Build Command:** ${info.buildCommand || "(none)"}`,
          `**Start Command:** ${info.startCommand || "(none)"}`,
          `**Has Tests:** ${info.hasTests ? "✅" : "❌"}`,
          `**Has Dockerfile:** ${info.hasDockerfile ? "✅" : "❌ (will be generated)"}`,
          `**Is Monorepo:** ${info.isMonorepo ? `✅ (${info.monorepoTool})` : "❌"}`,
          info.envVars.length > 0
            ? `**Env Vars Needed:** ${info.envVars.slice(0, 8).join(", ")}`
            : "",
          info.warnings.length > 0
            ? `⚠️ **Warnings:** ${info.warnings.join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const action = await vscode.window.showInformationMessage(
          `Project Analysis: ${info.framework} (${info.language})`,
          { detail: lines.replace(/\*\*/g, ""), modal: true },
          "Deploy Now 🚀",
          "Close",
        );

        if (action === "Deploy Now 🚀") {
          await vscode.commands.executeCommand("deployflow.deploy");
        }
      },
    );
  }
}
