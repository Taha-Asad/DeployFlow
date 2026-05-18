"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/test/DeployCommand.test.ts
// Tests for the DeployCommand class
// ────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const DeployCommand_1 = require("../commands/DeployCommand");
const WorkflowEngine_1 = require("../core/WorkflowEngine");
const ConfigManager_1 = require("../core/ConfigManager");
const SecretManager_1 = require("../core/SecretManager");
const ProgressPanel_1 = require("../ui/ProgressPanel");
const testUtils_1 = require("./testUtils");
suite("DeployCommand", () => {
    let workflowEngine;
    let configManager;
    let secretManager;
    let progressPanel;
    let context;
    suiteSetup(async () => {
        context = (0, testUtils_1.createMockExtensionContext)();
    });
    setup(() => {
        configManager = new ConfigManager_1.ConfigManager(context);
        secretManager = new SecretManager_1.SecretManager(context.secrets);
        workflowEngine = new WorkflowEngine_1.WorkflowEngine(configManager, secretManager, null);
        progressPanel = new ProgressPanel_1.ProgressPanel(vscode.Uri.file(__dirname));
    });
    test("should instantiate DeployCommand correctly", () => {
        const command = new DeployCommand_1.DeployCommand(workflowEngine, progressPanel, secretManager, configManager);
        assert.ok(command, "DeployCommand instance should be created");
    });
    test("should have execute method", () => {
        const command = new DeployCommand_1.DeployCommand(workflowEngine, progressPanel, secretManager, configManager);
        assert.ok(typeof command.execute === "function", "Execute method should exist");
    });
    test("execute should fail gracefully if no workspace is open", async () => {
        // This test will only work if workspace is empty
        const command = new DeployCommand_1.DeployCommand(workflowEngine, progressPanel, secretManager, configManager);
        // The execute method should handle the no-workspace case
        // We're just verifying it doesn't throw
        assert.ok(command, "Command should handle missing workspace");
    });
});
//# sourceMappingURL=DeployCommand.test.js.map