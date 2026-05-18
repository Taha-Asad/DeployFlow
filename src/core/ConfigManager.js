"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/core/ConfigManager.ts
// Reads and writes non-secret configuration from VS Code settings
// ─────────────────────────────────────────────────────────────────────────────
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
exports.ConfigManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class ConfigManager {
    context;
    fileUtils;
    logger;
    // Cache the config so we don't re-read it every time
    // `Map` is like an object but better for dynamic keys
    configCache = new Map();
    constructor(context) {
        this.context = context;
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Get a setting from VS Code's settings ────────────────────────────
    // `vscode.workspace.getConfiguration('deployflow')` gets all settings
    // that start with 'deployflow.' from the user's settings.json
    get(key, defaultValue) {
        const config = vscode.workspace.getConfiguration("deployflow");
        // `.get<T>` reads the setting; if not found, returns defaultValue
        return config.get(key, defaultValue);
    }
    // ── Convenience getters for common settings ───────────────────────────
    getAiProvider() {
        return this.get("aiProvider", "ollama");
    }
    getOllamaUrl() {
        return this.get("ollamaUrl", "http://localhost:11434");
    }
    getOllamaModel() {
        return this.get("ollamaModel", "codellama");
    }
    getDefaultTarget() {
        return this.get("defaultTarget", "vps");
    }
    getMaxFixAttempts() {
        return this.get("maxFixAttempts", 3);
    }
    isTrivyScanEnabled() {
        return this.get("enableTrivyScan", true);
    }
    isMonitoringEnabled() {
        return this.get("enableMonitoring", false);
    }
    isKubernetesEnabled() {
        return this.get("enableKubernetes", false);
    }
    // ── Get the currently open project folder ────────────────────────────
    // Returns the path to the folder the user has open in VS Code
    getWorkspaceFolder() {
        // `vscode.workspace.workspaceFolders` is an array of open folders
        // Most of the time there's just one
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return null;
        }
        // `.uri.fsPath` converts VS Code's URI to a normal file path
        return folders[0].uri.fsPath;
    }
    // ── Load deployment config for the current project ────────────────────
    // We store config in `.deployflow/config.json` inside the project folder
    async loadDeployConfig() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return null;
        }
        // Check the in-memory cache first
        const cached = this.configCache.get(workspaceFolder);
        if (cached) {
            return cached;
        }
        // Look for the config file in the project
        const configPath = path.join(workspaceFolder, ".deployflow", "config.json");
        const config = await this.fileUtils.readJson(configPath);
        if (config) {
            this.configCache.set(workspaceFolder, config);
        }
        return config;
    }
    // ── Save deployment config for the current project ────────────────────
    async saveDeployConfig(config) {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }
        const configPath = path.join(workspaceFolder, ".deployflow", "config.json");
        // Pretty-print JSON with 2-space indentation
        await this.fileUtils.writeFile(configPath, JSON.stringify(config, null, 2));
        // Update the cache
        this.configCache.set(workspaceFolder, config);
        this.logger.info("Deploy config saved");
    }
    // ── Get path to the .deployflow folder ───────────────────────────────
    getDeployFlowDir() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return null;
        }
        return path.join(workspaceFolder, ".deployflow");
    }
    // ── Get path to error logs folder ────────────────────────────────────
    getErrorLogsDir() {
        const dir = this.getDeployFlowDir();
        if (!dir) {
            return null;
        }
        return path.join(dir, "error-logs");
    }
    // ── Get path to snapshots folder ─────────────────────────────────────
    getSnapshotsDir() {
        const dir = this.getDeployFlowDir();
        if (!dir) {
            return null;
        }
        return path.join(dir, "snapshots");
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=ConfigManager.js.map