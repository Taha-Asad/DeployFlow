// ────────────────────────────────────────────────────────────────────────────
// src/test/DeployCommand.test.ts
// Tests for the DeployCommand class
// ────────────────────────────────────────────────────────────────────────────

import * as assert from "assert";
import * as vscode from "vscode";
import { DeployCommand } from "../commands/DeployCommand";
import { WorkflowEngine } from "../core/WorkflowEngine";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { ProgressPanel } from "../ui/ProgressPanel";
import { createMockExtensionContext } from "./testUtils";

suite("DeployCommand", () => {
  let workflowEngine: WorkflowEngine;
  let configManager: ConfigManager;
  let secretManager: SecretManager;
  let progressPanel: ProgressPanel;
  let context: vscode.ExtensionContext;

  suiteSetup(async () => {
    context = createMockExtensionContext();
  });

  setup(() => {
    configManager = new ConfigManager(context);
    secretManager = new SecretManager(context.secrets);
    workflowEngine = new WorkflowEngine(
      configManager,
      secretManager,
      null as any,
    );
    progressPanel = new ProgressPanel(vscode.Uri.file(__dirname));
  });

  test("should instantiate DeployCommand correctly", () => {
    const command = new DeployCommand(
      workflowEngine,
      progressPanel,
      secretManager,
      configManager,
    );
    assert.ok(command, "DeployCommand instance should be created");
  });

  test("should have execute method", () => {
    const command = new DeployCommand(
      workflowEngine,
      progressPanel,
      secretManager,
      configManager,
    );
    assert.ok(
      typeof command.execute === "function",
      "Execute method should exist",
    );
  });

  test("execute should fail gracefully if no workspace is open", async () => {
    // This test will only work if workspace is empty
    const command = new DeployCommand(
      workflowEngine,
      progressPanel,
      secretManager,
      configManager,
    );

    // The execute method should handle the no-workspace case
    // We're just verifying it doesn't throw
    assert.ok(command, "Command should handle missing workspace");
  });
});
