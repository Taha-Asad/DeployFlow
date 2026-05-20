// ────────────────────────────────────────────────────────────────────────────
// src/ui/StatusBar.ts
// Creates the 🚀 Deploy button in VS Code's bottom status bar
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";

export class StatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );

    this.statusBarItem.command = "deployflow.deploy";
    this.setIdle();
    this.statusBarItem.show();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  public setIdle(): void {
    this.clearIdleTimer();
    this.statusBarItem.text = "$(rocket) Deploy";
    this.statusBarItem.tooltip = "DeployFlow AI: Click to deploy your project";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.command = "deployflow.deploy";
  }

  public setDeploying(step: string): void {
    this.clearIdleTimer();
    this.statusBarItem.text = `$(loading~spin) ${step}`;
    this.statusBarItem.tooltip = `DeployFlow AI is deploying: ${step}`;
    this.statusBarItem.command = "deployflow.showProgress";
  }

  public setSuccess(url?: string): void {
    this.clearIdleTimer();
    this.statusBarItem.text = "$(check) Deployed!";
    this.statusBarItem.tooltip = url
      ? `DeployFlow AI: Deployed to ${url} — click to redeploy`
      : "DeployFlow AI: Deployment successful — click to redeploy";
    this.statusBarItem.command = "deployflow.deploy";

    this.idleTimer = setTimeout(() => this.setIdle(), 8000);
  }

  public setError(errorMsg?: string): void {
    this.clearIdleTimer();
    this.statusBarItem.text = "$(error) Deploy Failed";
    this.statusBarItem.tooltip = errorMsg
      ? `DeployFlow AI: ${errorMsg.substring(0, 100)} — click to retry`
      : "DeployFlow AI: Deployment failed — click to retry";
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    this.statusBarItem.command = "deployflow.deploy";

    this.idleTimer = setTimeout(() => this.setIdle(), 15000);
  }

  public dispose(): void {
    this.clearIdleTimer();
    this.statusBarItem.dispose();
  }
}
