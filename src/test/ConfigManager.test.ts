// ────────────────────────────────────────────────────────────────────────────
// src/test/ConfigManager.test.ts
// Tests for the ConfigManager class
// ────────────────────────────────────────────────────────────────────────────

import * as assert from "assert";
import { ConfigManager } from "../core/ConfigManager";
import * as vscode from "vscode";
import { createMockExtensionContext } from "./testUtils";

suite("ConfigManager", () => {
  let configManager: ConfigManager;
  let context: vscode.ExtensionContext;

  suiteSetup(async () => {
    context = createMockExtensionContext();
  });

  setup(() => {
    configManager = new ConfigManager(context);
  });

  test("should return a default target", () => {
    const target = configManager.getDefaultTarget();
    assert.ok(target, "Default target should exist");
    assert.strictEqual(typeof target, "string");
  });

  test("should return valid default targets", () => {
    const validTargets = [
      "vps",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "gcp",
      "azure",
    ];
    const target = configManager.getDefaultTarget();
    assert.ok(
      validTargets.includes(target),
      `Target '${target}' should be valid`,
    );
  });

  test("should identify workspace folder if available", () => {
    const wsFolder = configManager.getWorkspaceFolder();
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      assert.ok(wsFolder, "Workspace folder should be found if open");
    }
  });

  test("should have methods for loading and saving config", () => {
    assert.ok(
      typeof configManager.loadDeployConfig === "function",
      "Should have loadDeployConfig method",
    );
    assert.ok(
      typeof configManager.saveDeployConfig === "function",
      "Should have saveDeployConfig method",
    );
  });

  test("should retrieve AI provider setting", () => {
    const aiProvider = configManager.getAiProvider();
    assert.ok(aiProvider, "AI provider should be set");
    const validProviders = ["ollama", "openai", "anthropic", "gemini"];
    assert.ok(
      validProviders.includes(aiProvider),
      `'${aiProvider}' should be valid AI provider`,
    );
  });
});
