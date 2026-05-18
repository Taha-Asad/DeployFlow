"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/commands/RollbackCommand.ts
// Rolls back to the previous deployment snapshot
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
exports.RollbackCommand = void 0;
const vscode = __importStar(require("vscode"));
class RollbackCommand {
    workflowEngine;
    secretManager;
    constructor(workflowEngine, secretManager) {
        this.workflowEngine = workflowEngine;
        this.secretManager = secretManager;
    }
    async execute() {
        // Confirm rollback — it's a destructive action
        const confirmed = await vscode.window.showWarningMessage("⏮️ Are you sure you want to rollback to the previous deployment?", { modal: true }, "Yes, Rollback", "Cancel");
        if (confirmed !== "Yes, Rollback") {
            return;
        }
        const appName = await vscode.window.showInputBox({
            prompt: "Enter the app name to rollback",
            placeHolder: "my-app",
        });
        if (!appName) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "⏮️ Rolling back deployment...",
            cancellable: false,
        }, async (progress) => {
            const success = await this.workflowEngine.rollback(appName, (msg) => {
                progress.report({ message: msg });
            });
            if (success) {
                vscode.window.showInformationMessage("✅ Rollback completed successfully.");
            }
            else {
                vscode.window.showErrorMessage("❌ Rollback failed. Check the Output panel for details.");
            }
        });
    }
}
exports.RollbackCommand = RollbackCommand;
//# sourceMappingURL=RollbackCommand.js.map