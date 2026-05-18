// ─────────────────────────────────────────────────────────────────────────────
// src/extension.ts
// THE ENTRY POINT — VS Code calls `activate()` when the extension loads
// and `deactivate()` when VS Code closes or the extension is disabled
// ─────────────────────────────────────────────────────────────────────────────

// We import `vscode` which gives us all VS Code APIs
// Think of it as the toolkit VS Code gives us to build with
import * as vscode from "vscode";

// Import our own modules (files we will create)
import { WorkflowEngine } from "./core/WorkflowEngine";
import { ConfigManager } from "./core/ConfigManager";
import { SecretManager } from "./core/SecretManager";
import { Logger } from "./utils/Logger";

// Import command handlers
import { DeployCommand } from "./commands/DeployCommand";
import { AnalyzeCommand } from "./commands/AnalyzeCommand";
import { GenerateDocsCommand } from "./commands/GenerateDocsCommand";
import { RollbackCommand } from "./commands/RollbackCommand";
import { ConfigureCommand } from "./commands/ConfigureCommand";
import { ProgressPanel } from "./ui/ProgressPanel";
import { StatusBar } from "./ui/StatusBar";

// ─────────────────────────────────────────────────────────────────────────────
// `activate` is called by VS Code when your extension starts
// `context` is a bag of useful things VS Code gives us:
//   - context.subscriptions: a list where we register things to clean up later
//   - context.globalStorageUri: a folder on disk we can use for storage
//   - context.secrets: the secure password storage
// ─────────────────────────────────────────────────────────────────────────────
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // ── Step 1: Start the Logger ───────────────────────────────────────────
  // Logger creates an "Output Channel" in VS Code
  // (the panel at the bottom where you see log messages)
  const logger = Logger.getInstance();
  logger.info("🚀 DeployFlow AI is starting up...");

  // ── Step 2: Start the Secret Manager ──────────────────────────────────
  // SecretManager wraps VS Code's built-in secure storage
  // Think of it as a safe in VS Code where we store passwords and API keys
  // We pass `context.secrets` which is VS Code's secure storage API
  const secretManager = new SecretManager(context.secrets);

  // ── Step 3: Start the Config Manager ──────────────────────────────────
  // ConfigManager reads settings from VS Code's settings.json
  // (the non-secret stuff like which AI provider to use)
  // We pass `context` so ConfigManager can also access global storage
  const configManager = new ConfigManager(context);

  // ── Step 4: Create the Workflow Engine ────────────────────────────────
  // This is the BRAIN. It runs all 7 deployment steps in order.
  // We give it the managers it needs to work
  const workflowEngine = new WorkflowEngine(
    configManager,
    secretManager,
    logger,
  );

  // ── Step 5: Create the Status Bar button ──────────────────────────────
  // This creates the "🚀 Deploy" button in the bottom bar of VS Code
  const statusBar = new StatusBar();
  // Register it so VS Code cleans it up when extension is disabled
  context.subscriptions.push(statusBar);

  // ── Step 6: Create & Register the Progress Panel ───────────────────────
  // This is the sidebar panel that shows live deployment progress
  const progressPanel = new ProgressPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ProgressPanel.viewType,
      progressPanel,
    ),
  );

  // ── Step 7: Register Commands ─────────────────────────────────────────
  // A "command" is something VS Code can run
  // The string 'deployflow.deploy' must EXACTLY match what's in package.json
  // When the user clicks the Deploy button or runs it from Command Palette,
  // VS Code looks up 'deployflow.deploy' and runs our function

  // MAIN DEPLOY COMMAND
  // `vscode.commands.registerCommand` takes:
  //   - the command name (must match package.json)
  //   - the function to run when the command is invoked
  const deployDisposable = vscode.commands.registerCommand(
    "deployflow.deploy",
    async () => {
      // Create a fresh DeployCommand and run it
      // We pass all dependencies it needs
      const command = new DeployCommand(
        workflowEngine,
        progressPanel,
        secretManager,
        configManager,
      );
      await command.execute();
    },
  );

  // ANALYZE COMMAND — just analyze, don't deploy
  const analyzeDisposable = vscode.commands.registerCommand(
    "deployflow.analyze",
    async () => {
      const command = new AnalyzeCommand(configManager);
      await command.execute();
    },
  );

  // GENERATE DOCS COMMAND — just generate SDLC documentation
  const generateDocsDisposable = vscode.commands.registerCommand(
    "deployflow.generateDocs",
    async () => {
      const command = new GenerateDocsCommand(configManager, secretManager);
      await command.execute();
    },
  );

  // ROLLBACK COMMAND — restore previous deployment
  const rollbackDisposable = vscode.commands.registerCommand(
    "deployflow.rollback",
    async () => {
      const command = new RollbackCommand(workflowEngine, secretManager);
      await command.execute();
    },
  );

  // CONFIGURE COMMAND — interactive setup wizard
  const configureDisposable = vscode.commands.registerCommand(
    "deployflow.configure",
    async () => {
      const command = new ConfigureCommand(configManager, secretManager);
      await command.execute();
    },
  );

  // SHOW PROGRESS COMMAND — open the progress panel
  const showProgressDisposable = vscode.commands.registerCommand(
    "deployflow.showProgress",
    () => {
      progressPanel.show();
    },
  );

  // ── Step 8: Register everything for cleanup ────────────────────────────
  // `context.subscriptions.push(...)` means:
  // "When VS Code closes or disables this extension, clean up these things"
  // This prevents memory leaks
  context.subscriptions.push(
    deployDisposable,
    analyzeDisposable,
    generateDocsDisposable,
    rollbackDisposable,
    configureDisposable,
    showProgressDisposable,
    logger, // Logger also needs cleanup (closes the output channel)
  );

  // ── Step 9: Welcome & AI Configuration Prompt ──────────────────────────
  // Show welcome message on first activation
  const hasSeenWelcome = context.globalState.get<boolean>(
    "hasSeenWelcome",
    false,
  );

  if (!hasSeenWelcome) {
    const action = await vscode.window.showInformationMessage(
      "🚀 DeployFlow AI is ready! Let's get you set up.",
      "Configure AI & Deployment",
      "Maybe Later",
    );

    if (action === "Configure AI & Deployment") {
      await vscode.commands.executeCommand("deployflow.configure");
    }

    await context.globalState.update("hasSeenWelcome", true);
  }

  // ── Check AI provider health on every activation ──────────────────────
  const aiProvider = configManager.getAiProvider();

  if (aiProvider !== "ollama") {
    const key = await secretManager.getAiKey(aiProvider);
    if (!key) {
      const fix = await vscode.window.showWarningMessage(
        `⚠️ AI provider "${aiProvider}" is selected but no API key is set. ` +
          "The AI error fixer will fail until you configure it.",
        "Configure AI Now",
        "Switch to Ollama (no key needed)",
      );

      if (fix === "Configure AI Now") {
        await vscode.commands.executeCommand("deployflow.configure");
      } else if (fix === "Switch to Ollama (no key needed)") {
        const config = vscode.workspace.getConfiguration("deployflow");
        await config.update("aiProvider", "ollama", vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage("✅ Switched AI provider to Ollama (local, no API key needed).");
      }
    }
  } else {
    const { ShellUtils } = await import("./utils/ShellUtils.js");
    const shell = new ShellUtils();
    const ollamaInstalled = await shell.commandExists("ollama");
    if (!ollamaInstalled) {
      const install = await vscode.window.showWarningMessage(
        "⚠️ Ollama is not installed. The AI error fixer needs it.",
        "Install Ollama",
        "Open Download Page",
      );
      if (install === "Install Ollama") {
        await vscode.commands.executeCommand("deployflow.configure");
      } else if (install === "Open Download Page") {
        vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/download"));
      }
    }
  }

  logger.info("✅ DeployFlow AI activated successfully!");
}

// ─────────────────────────────────────────────────────────────────────────────
// `deactivate` is called when VS Code is closing or extension is disabled
// We can do cleanup here, but most cleanup is handled via context.subscriptions
// ─────────────────────────────────────────────────────────────────────────────
export function deactivate(): void {
  Logger.getInstance().info("👋 DeployFlow AI deactivated");
}
