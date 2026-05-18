// ────────────────────────────────────────────────────────────────────────────
// src/commands/GenerateDocsCommand.ts
// Generates SDLC documentation (BRD, SRS, API docs, Architecture) using AI
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import * as path from "path";
import { ProjectAnalyzer } from "../core/ProjectAnalyzer";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { AIManager } from "../ai/AIManager";
import { SdlcGenerator } from "../generators/SdlcGenerator";

export class GenerateDocsCommand {
  private configManager: ConfigManager;
  private secretManager: SecretManager;

  constructor(configManager: ConfigManager, secretManager: SecretManager) {
    this.configManager = configManager;
    this.secretManager = secretManager;
  }

  public async execute(): Promise<void> {
    const workspaceFolder = this.configManager.getWorkspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No folder open. Please open a project first.",
      );
      return;
    }

    // Confirm AI provider is configured
    const aiProvider = this.configManager.getAiProvider();
    if (aiProvider !== "ollama") {
      const key = await this.secretManager.getAiKey(
        aiProvider as "openai" | "anthropic" | "gemini",
      );
      if (!key) {
        const configure = await vscode.window.showWarningMessage(
          `⚠️ ${aiProvider} API key not configured. SDLC generation requires AI.`,
          "Configure Now",
        );
        if (configure) {
          await vscode.commands.executeCommand("deployflow.configure");
        }
        return;
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "📄 Generating SDLC Documentation...",
        cancellable: false,
      },
      async (progress) => {
        const analyzer = new ProjectAnalyzer();
        const projectInfo = await analyzer.analyze(workspaceFolder);

        const aiManager = new AIManager(this.configManager, this.secretManager);
        const sdlcGenerator = new SdlcGenerator(aiManager);

        const docs = await sdlcGenerator.generate(projectInfo, (msg) => {
          progress.report({ message: msg });
        });

        const docsDir = path.join(workspaceFolder, "docs");
        const generatedFiles = Object.keys(docs).length;

        const action = await vscode.window.showInformationMessage(
          `✅ Generated ${generatedFiles} SDLC documents in /docs`,
          "Open docs folder",
          "Close",
        );

        if (action === "Open docs folder") {
          vscode.commands.executeCommand(
            "revealFileInOS",
            vscode.Uri.file(docsDir),
          );
        }
      },
    );
  }
}
