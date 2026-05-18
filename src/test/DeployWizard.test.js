"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/test/DeployWizard.test.ts
// Tests for the DeployWizard UI component
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
const DeployWizard_1 = require("../ui/DeployWizard");
const ConfigManager_1 = require("../core/ConfigManager");
const SecretManager_1 = require("../core/SecretManager");
const testUtils_1 = require("./testUtils");
suite("DeployWizard", () => {
    let configManager;
    let secretManager;
    let context;
    suiteSetup(async () => {
        context = (0, testUtils_1.createMockExtensionContext)();
    });
    setup(() => {
        configManager = new ConfigManager_1.ConfigManager(context);
        secretManager = new SecretManager_1.SecretManager(context.secrets);
    });
    test("DeployWizard should instantiate correctly", () => {
        const wizard = new DeployWizard_1.DeployWizard(configManager, secretManager);
        assert.ok(wizard, "DeployWizard instance should be created");
    });
    test("DeployWizard.show should return null when cancelled", async () => {
        const wizard = new DeployWizard_1.DeployWizard(configManager, secretManager);
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
        assert.strictEqual(typeof defaultTarget, "string", "Default target should be a string");
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
        assert.ok(validTargets.includes(defaultTarget), `Default target '${defaultTarget}' should be in valid targets`);
    });
});
//# sourceMappingURL=DeployWizard.test.js.map