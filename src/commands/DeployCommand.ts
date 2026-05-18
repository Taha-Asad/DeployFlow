// ────────────────────────────────────────────────────────────────────────────
// src/commands/DeployCommand.ts
// Handles the main "deployflow.deploy" command
// Orchestrates: wizard → workflow engine → success/error feedback
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { WorkflowEngine } from "../core/WorkflowEngine";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { DeployWizard } from "../ui/DeployWizard";
import { ProgressPanel } from "../ui/ProgressPanel";

export class DeployCommand {
  private workflowEngine: WorkflowEngine;
  private progressPanel: ProgressPanel;
  private secretManager: SecretManager;
  private configManager: ConfigManager;

  constructor(
    workflowEngine: WorkflowEngine,
    progressPanel: ProgressPanel,
    secretManager: SecretManager,
    configManager: ConfigManager,
  ) {
    this.workflowEngine = workflowEngine;
    this.progressPanel = progressPanel;
    this.secretManager = secretManager;
    this.configManager = configManager;
  }

  public async execute(): Promise<void> {
    // ── 1. Make sure a workspace is open ──────────────────────────────────
    const workspaceFolder = this.configManager.getWorkspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "❌ DeployFlow: No folder open. Open a project folder first.",
      );
      return;
    }

    // ── 2. Load existing config or show wizard ────────────────────────────
    let deployConfig = await this.configManager.loadDeployConfig();

    if (!deployConfig) {
      // First time — show the wizard
      const wizard = new DeployWizard(this.configManager, this.secretManager);
      const extensionUri = vscode.extensions.getExtension(
        "deployflow.deployflow-ai",
      )?.extensionUri;

      if (!extensionUri) {
        vscode.window.showErrorMessage("Could not find extension URI");
        return;
      }

      deployConfig = await wizard.show(extensionUri);

      if (!deployConfig) {
        // User cancelled the wizard
        return;
      }
    } else {
      // Config exists — ask if they want to reconfigure or just deploy
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: "🚀 Deploy Now",
            description: `to ${deployConfig.target}`,
            value: "deploy",
          },
          {
            label: "⚙️ Reconfigure",
            description: "change target or settings",
            value: "configure",
          },
        ],
        { placeHolder: "What would you like to do?" },
      );

      if (!choice) {
        return;
      }

      if (choice.value === "configure") {
        const wizard = new DeployWizard(this.configManager, this.secretManager);
        const extensionUri = vscode.extensions.getExtension(
          "deployflow.deployflow-ai",
        )?.extensionUri;
        if (!extensionUri) {
          return;
        }

        deployConfig = await wizard.show(extensionUri);
        if (!deployConfig) {
          return;
        }
      }
    }

    // ── 3. Show the progress panel ─────────────────────────────────────────
    this.progressPanel.reset();
    this.progressPanel.show();

    // ── 4. Run the deployment workflow ────────────────────────────────────
    const result = await this.workflowEngine.run(
      this.progressPanel,
      deployConfig,
    );

    // ── 5. Handle result ──────────────────────────────────────────────────
    if (result.success) {
      const message = result.deployedUrl
        ? `✅ Deployed successfully to ${result.deployedUrl}`
        : "✅ Deployment successful!";

      const action = result.deployedUrl
        ? await vscode.window.showInformationMessage(
            message,
            "Open App 🌐",
            "View Logs",
          )
        : await vscode.window.showInformationMessage(message, "View Logs");

      if (action === "Open App 🌐" && result.deployedUrl) {
        vscode.env.openExternal(vscode.Uri.parse(result.deployedUrl));
      }
      if (action === "View Logs") {
        this.progressPanel.show();
      }
    } else {
      const action = await vscode.window.showErrorMessage(
        `❌ Deployment failed: ${result.error}`,
        "View Logs",
        "Retry",
      );

      if (action === "View Logs") {
        this.progressPanel.show();
      }
      if (action === "Retry") {
        await this.execute();
      }
    }
  }
}
