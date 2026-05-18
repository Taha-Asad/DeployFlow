// ────────────────────────────────────────────────────────────────────────────
// src/ui/DiffViewer.ts
// Shows AI-suggested file patches in VS Code's built-in diff editor
// User approves or rejects each patch before it's applied
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import * as path from "path";
import { FilePatch } from "../ai/AIManager";

export class DiffViewer {
  // ── Show a diff and ask the user to approve or reject ────────────────────
  // Returns true if the user clicks "Apply Fix", false otherwise
  public async show(patch: FilePatch): Promise<boolean> {
    // Create virtual document URIs for the diff view
    const originalUri = vscode.Uri.parse(
      `deployflow-diff://${encodeURIComponent(patch.filePath)}/original?${Date.now()}`,
    );
    const fixedUri = vscode.Uri.parse(
      `deployflow-diff://${encodeURIComponent(patch.filePath)}/fixed?${Date.now()}`,
    );

    const provider = new DiffContentProvider(
      patch.oldContent,
      patch.newContent,
    );
    const disposable = vscode.workspace.registerTextDocumentContentProvider(
      "deployflow-diff",
      provider,
    );

    try {
      await vscode.commands.executeCommand(
        "vscode.diff",
        originalUri,
        fixedUri,
        `🤖 AI Fix: ${path.basename(patch.filePath)} — ${patch.description}`,
        {
          preview: true,
          viewColumn: vscode.ViewColumn.One,
        },
      );

      const choice = await vscode.window.showInformationMessage(
        `AI suggests a fix for ${path.basename(patch.filePath)}: ${patch.description}`,
        { modal: false },
        "Apply Fix ✅",
        "Skip ⏭️",
      );

      return choice === "Apply Fix ✅";
    } finally {
      disposable.dispose();
    }
  }

  // ── Show a simple information message for a patch (no diff view) ─────────
  public async showSimple(patch: FilePatch): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
      `AI Fix for ${path.basename(patch.filePath)}: ${patch.description}`,
      "Apply Fix ✅",
      "Skip ⏭️",
    );
    return choice === "Apply Fix ✅";
  }
}

// ── Virtual document provider for the diff view ──────────────────────────────
class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private originalContent: string;
  private fixedContent: string;
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  constructor(originalContent: string, fixedContent: string) {
    this.originalContent = originalContent;
    this.fixedContent = fixedContent;
  }

  provideTextDocumentContent(
    uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): string {
    if (uri.path.includes("/original")) {
      return this.originalContent;
    }
    return this.fixedContent;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
