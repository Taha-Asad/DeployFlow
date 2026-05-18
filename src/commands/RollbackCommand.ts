// ────────────────────────────────────────────────────────────────────────────
// src/commands/RollbackCommand.ts
// Rolls back to the previous deployment snapshot
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { WorkflowEngine } from "../core/WorkflowEngine";
import { SecretManager } from "../core/SecretManager";

export class RollbackCommand {
  private workflowEngine: WorkflowEngine;
  private secretManager: SecretManager;

  constructor(workflowEngine: WorkflowEngine, secretManager: SecretManager) {
    this.workflowEngine = workflowEngine;
    this.secretManager = secretManager;
  }

  public async execute(): Promise<void> {
    // Confirm rollback — it's a destructive action
    const confirmed = await vscode.window.showWarningMessage(
      "⏮️ Are you sure you want to rollback to the previous deployment?",
      { modal: true },
      "Yes, Rollback",
      "Cancel",
    );

    if (confirmed !== "Yes, Rollback") {
      return;
    }

    const appName = await vscode.window.showInputBox({
      prompt: "Enter the app name to rollback",
      placeHolder: "my-app",
    });

    if (!appName) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "⏮️ Rolling back deployment...",
        cancellable: false,
      },
      async (progress) => {
        const success = await this.workflowEngine.rollback(appName, (msg) => {
          progress.report({ message: msg });
        });

        if (success) {
          vscode.window.showInformationMessage(
            "✅ Rollback completed successfully.",
          );
        } else {
          vscode.window.showErrorMessage(
            "❌ Rollback failed. Check the Output panel for details.",
          );
        }
      },
    );
  }
}
