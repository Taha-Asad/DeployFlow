"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/test/ConfigManager.test.ts
// Tests for the ConfigManager class
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
const ConfigManager_1 = require("../core/ConfigManager");
const vscode = __importStar(require("vscode"));
const testUtils_1 = require("./testUtils");
suite("ConfigManager", () => {
    let configManager;
    let context;
    suiteSetup(async () => {
        context = (0, testUtils_1.createMockExtensionContext)();
    });
    setup(() => {
        configManager = new ConfigManager_1.ConfigManager(context);
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
        assert.ok(validTargets.includes(target), `Target '${target}' should be valid`);
    });
    test("should identify workspace folder if available", () => {
        const wsFolder = configManager.getWorkspaceFolder();
        if (vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders.length > 0) {
            assert.ok(wsFolder, "Workspace folder should be found if open");
        }
    });
    test("should have methods for loading and saving config", () => {
        assert.ok(typeof configManager.loadDeployConfig === "function", "Should have loadDeployConfig method");
        assert.ok(typeof configManager.saveDeployConfig === "function", "Should have saveDeployConfig method");
    });
    test("should retrieve AI provider setting", () => {
        const aiProvider = configManager.getAiProvider();
        assert.ok(aiProvider, "AI provider should be set");
        const validProviders = ["ollama", "openai", "anthropic", "gemini"];
        assert.ok(validProviders.includes(aiProvider), `'${aiProvider}' should be valid AI provider`);
    });
});
//# sourceMappingURL=ConfigManager.test.js.map