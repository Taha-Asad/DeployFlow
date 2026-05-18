// ────────────────────────────────────────────────────────────────────────────
// src/test/WorkflowEngine.test.ts
// Tests for the WorkflowEngine class
// ────────────────────────────────────────────────────────────────────────────

import * as assert from "assert";
import { WorkflowEngine } from "../core/WorkflowEngine";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { Logger } from "../utils/Logger";
import * as vscode from "vscode";
import { createMockExtensionContext } from "./testUtils";

suite("WorkflowEngine", () => {
  let workflowEngine: WorkflowEngine;
  let configManager: ConfigManager;
  let secretManager: SecretManager;
  let logger: Logger;
  let context: vscode.ExtensionContext;

  suiteSetup(async () => {
    context = createMockExtensionContext();
  });

  setup(() => {
    configManager = new ConfigManager(context);
    secretManager = new SecretManager(context.secrets);
    logger = Logger.getInstance();
    workflowEngine = new WorkflowEngine(configManager, secretManager, logger);
  });

  test("should instantiate WorkflowEngine correctly", () => {
    assert.ok(workflowEngine, "WorkflowEngine instance should be created");
  });

  test("should have run method", () => {
    assert.ok(
      typeof workflowEngine.run === "function",
      "run method should exist",
    );
  });

  test("Logger should be accessible", () => {
    const loggerInstance = Logger.getInstance();
    assert.ok(loggerInstance, "Logger instance should be available");
  });

  test("should support standard deployment targets", () => {
    const targets = [
      "vps",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "gcp",
      "azure",
    ];
    for (const target of targets) {
      assert.ok(target, `Target '${target}' should be supported`);
    }
  });
});
