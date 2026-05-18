// ────────────────────────────────────────────────────────────────────────────
// src/ui/StatusBar.ts
// Creates the 🚀 Deploy button in VS Code's bottom status bar
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";

export class StatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    // Create a status bar item on the LEFT side with high priority (appears near left)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );

    this.statusBarItem.command = "deployflow.deploy";
    this.setIdle();
    this.statusBarItem.show();
  }

  // ── Set to idle state (ready to deploy) ────────────────────────────────────
  public setIdle(): void {
    this.statusBarItem.text = "$(rocket) Deploy";
    this.statusBarItem.tooltip = "DeployFlow AI: Click to deploy your project";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.command = "deployflow.deploy";
  }

  // ── Set to deploying state (spinning) ─────────────────────────────────────
  public setDeploying(step: string): void {
    this.statusBarItem.text = `$(loading~spin) ${step}`;
    this.statusBarItem.tooltip = `DeployFlow AI is deploying: ${step}`;
    this.statusBarItem.command = "deployflow.showProgress"; // Click shows progress
  }

  // ── Set to success state ───────────────────────────────────────────────────
  public setSuccess(url?: string): void {
    this.statusBarItem.text = "$(check) Deployed!";
    this.statusBarItem.tooltip = url
      ? `DeployFlow AI: Deployed to ${url} — click to redeploy`
      : "DeployFlow AI: Deployment successful — click to redeploy";
    this.statusBarItem.command = "deployflow.deploy";

    // Auto-reset back to idle after 8 seconds
    setTimeout(() => this.setIdle(), 8000);
  }

  // ── Set to error state ─────────────────────────────────────────────────────
  public setError(errorMsg?: string): void {
    this.statusBarItem.text = "$(error) Deploy Failed";
    this.statusBarItem.tooltip = errorMsg
      ? `DeployFlow AI: ${errorMsg.substring(0, 100)} — click to retry`
      : "DeployFlow AI: Deployment failed — click to retry";
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    this.statusBarItem.command = "deployflow.deploy";

    // Auto-reset after 15 seconds
    setTimeout(() => this.setIdle(), 15000);
  }

  // ── Cleanup when extension is deactivated ─────────────────────────────────
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
