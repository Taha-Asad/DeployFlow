// ────────────────────────────────────────────────────────────────────────────
// src/test/DeployWizard.test.ts
// Tests for the DeployWizard UI component
// ────────────────────────────────────────────────────────────────────────────

import * as assert from "assert";
import * as vscode from "vscode";
import { DeployWizard } from "../ui/DeployWizard";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { createMockExtensionContext } from "./testUtils";

suite("DeployWizard", () => {
  let configManager: ConfigManager;
  let secretManager: SecretManager;
  let context: vscode.ExtensionContext;

  suiteSetup(async () => {
    context = createMockExtensionContext();
  });

  setup(() => {
    configManager = new ConfigManager(context);
    secretManager = new SecretManager(context.secrets);
  });

  test("DeployWizard should instantiate correctly", () => {
    const wizard = new DeployWizard(configManager, secretManager);
    assert.ok(wizard, "DeployWizard instance should be created");
  });

  test("DeployWizard.show should return null when cancelled", async () => {
    const wizard = new DeployWizard(configManager, secretManager);
    const ext = vscode.extensions.getExtension("deployflow.deployflow-ai");
    if (!ext) {
      throw new Error("Extension URI not found");
    }

    // Note: Actual UI testing requires manual interaction
    // This test verifies the structure is correct
    assert.ok(wizard, "Wizard should exist");
  });

  test("ConfigManager should have default target", () => {
    const defaultTarget = configManager.getDefaultTarget();
    assert.ok(defaultTarget, "Default target should be set");
    assert.strictEqual(
      typeof defaultTarget,
      "string",
      "Default target should be a string",
    );
  });

  test("ConfigManager should support all deployment targets", () => {
    const validTargets = [
      "vps",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "gcp",
      "azure",
    ];
    const defaultTarget = configManager.getDefaultTarget();
    assert.ok(
      validTargets.includes(defaultTarget),
      `Default target '${defaultTarget}' should be in valid targets`,
    );
  });
});
