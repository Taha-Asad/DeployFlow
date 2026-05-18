"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/ui/DiffViewer.ts
// Shows AI-suggested file patches in VS Code's built-in diff editor
// User approves or rejects each patch before it's applied
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
exports.DiffViewer = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class DiffViewer {
    // ── Show a diff and ask the user to approve or reject ────────────────────
    // Returns true if the user clicks "Apply Fix", false otherwise
    async show(patch) {
        // Create virtual document URIs for the diff view
        const originalUri = vscode.Uri.parse(`deployflow-diff://${encodeURIComponent(patch.filePath)}/original?${Date.now()}`);
        const fixedUri = vscode.Uri.parse(`deployflow-diff://${encodeURIComponent(patch.filePath)}/fixed?${Date.now()}`);
        const provider = new DiffContentProvider(patch.oldContent, patch.newContent);
        const disposable = vscode.workspace.registerTextDocumentContentProvider("deployflow-diff", provider);
        try {
            await vscode.commands.executeCommand("vscode.diff", originalUri, fixedUri, `🤖 AI Fix: ${path.basename(patch.filePath)} — ${patch.description}`, {
                preview: true,
                viewColumn: vscode.ViewColumn.One,
            });
            const choice = await vscode.window.showInformationMessage(`AI suggests a fix for ${path.basename(patch.filePath)}: ${patch.description}`, { modal: false }, "Apply Fix ✅", "Skip ⏭️");
            return choice === "Apply Fix ✅";
        }
        finally {
            disposable.dispose();
        }
    }
    // ── Show a simple information message for a patch (no diff view) ─────────
    async showSimple(patch) {
        const choice = await vscode.window.showInformationMessage(`AI Fix for ${path.basename(patch.filePath)}: ${patch.description}`, "Apply Fix ✅", "Skip ⏭️");
        return choice === "Apply Fix ✅";
    }
}
exports.DiffViewer = DiffViewer;
// ── Virtual document provider for the diff view ──────────────────────────────
class DiffContentProvider {
    originalContent;
    fixedContent;
    _onDidChange = new vscode.EventEmitter();
    get onDidChange() {
        return this._onDidChange.event;
    }
    constructor(originalContent, fixedContent) {
        this.originalContent = originalContent;
        this.fixedContent = fixedContent;
    }
    provideTextDocumentContent(uri, _token) {
        if (uri.path.includes("/original")) {
            return this.originalContent;
        }
        return this.fixedContent;
    }
    dispose() {
        this._onDidChange.dispose();
    }
}
//# sourceMappingURL=Diffviewer.js.map