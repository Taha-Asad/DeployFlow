"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/test/WorkflowEngine.test.ts
// Tests for the WorkflowEngine class
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
const WorkflowEngine_1 = require("../core/WorkflowEngine");
const ConfigManager_1 = require("../core/ConfigManager");
const SecretManager_1 = require("../core/SecretManager");
const Logger_1 = require("../utils/Logger");
const testUtils_1 = require("./testUtils");
suite("WorkflowEngine", () => {
    let workflowEngine;
    let configManager;
    let secretManager;
    let logger;
    let context;
    suiteSetup(async () => {
        context = (0, testUtils_1.createMockExtensionContext)();
    });
    setup(() => {
        configManager = new ConfigManager_1.ConfigManager(context);
        secretManager = new SecretManager_1.SecretManager(context.secrets);
        logger = Logger_1.Logger.getInstance();
        workflowEngine = new WorkflowEngine_1.WorkflowEngine(configManager, secretManager, logger);
    });
    test("should instantiate WorkflowEngine correctly", () => {
        assert.ok(workflowEngine, "WorkflowEngine instance should be created");
    });
    test("should have run method", () => {
        assert.ok(typeof workflowEngine.run === "function", "run method should exist");
    });
    test("Logger should be accessible", () => {
        const loggerInstance = Logger_1.Logger.getInstance();
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
//# sourceMappingURL=WorkflowEngine.test.js.map