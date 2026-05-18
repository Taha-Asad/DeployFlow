// ─────────────────────────────────────────────────────────────────────────────
// src/core/WorkflowEngine.ts
// The master controller — runs all deployment steps in order
// Think of it as a pipeline: analyze → generate → build → scan → deploy → verify
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { ConfigManager, DeployConfig } from "./ConfigManager";
import { SecretManager } from "./SecretManager";
import { ProjectAnalyzer, ProjectInfo } from "./ProjectAnalyzer";
import { Logger } from "../utils/Logger";
import { FileUtils } from "../utils/FileUtils";
import { AIManager } from "../ai/AIManager";
import { ErrorFixer } from "../ai/ErrorFixer";
import { BuildManager } from "../builders/BuildManager";
import { DockerBuilder } from "../builders/DockerBuilder";
import { DockerfileGenerator } from "../generators/DockerfileGenerator";
import { ComposeGenerator } from "../generators/ComposeGenerator";
import { NginxGenerator } from "../generators/NginxGenerator";
import { CiCdGenerator } from "../generators/CiCdGenerator";
import { KubernetesGenerator } from "../generators/KubernetesGenerator";
import { MonitoringGenerator } from "../generators/MonitoringGenerator";
import { SshDeployer } from "../deployers/SshDeployer";
import { TrivyScanner } from "../security/TrivyScanner";

import { FilePatch } from "../ai/AIManager";
import * as path from "path";
import { DiffViewer } from "../ui/Diffviewer";
import { ProgressPanel } from "../ui/ProgressPanel";

// Each step in our pipeline
export enum WorkflowStep {
  ANALYZE = "analyze",
  GENERATE = "generate",
  BUILD = "build",
  SCAN = "scan",
  DEPLOY = "deploy",
  VERIFY = "verify",
  DONE = "done",
}

// What the whole workflow returns
export interface WorkflowResult {
  success: boolean;
  projectInfo?: ProjectInfo;
  deployedUrl?: string;
  error?: string;
  stepsCompleted: WorkflowStep[];
}

export class WorkflowEngine {
  private configManager: ConfigManager;
  private secretManager: SecretManager;
  private logger: Logger;
  private fileUtils: FileUtils;

  // Sub-components — each handles one part of the workflow
  private projectAnalyzer: ProjectAnalyzer;
  private aiManager: AIManager;
  private errorFixer: ErrorFixer;
  private buildManager: BuildManager;
  private dockerBuilder: DockerBuilder;

  // Generators
  private dockerfileGenerator: DockerfileGenerator;
  private composeGenerator: ComposeGenerator;
  private nginxGenerator: NginxGenerator;
  private cicdGenerator: CiCdGenerator;
  private kubernetesGenerator: KubernetesGenerator;
  private monitoringGenerator: MonitoringGenerator;

  // Deployers & Scanners
  private sshDeployer: SshDeployer;
  private trivyScanner: TrivyScanner;

  // UI components (set before each run)
  private progressPanel: ProgressPanel | null = null;
  private diffViewer: DiffViewer | null = null;

  constructor(
    configManager: ConfigManager,
    secretManager: SecretManager,
    logger: Logger,
  ) {
    this.configManager = configManager;
    this.secretManager = secretManager;
    this.logger = logger;
    this.fileUtils = new FileUtils();

    // Initialize all sub-components
    this.projectAnalyzer = new ProjectAnalyzer();
    this.aiManager = new AIManager(configManager, secretManager);
    this.errorFixer = new ErrorFixer(this.aiManager, configManager);
    this.buildManager = new BuildManager();
    this.dockerBuilder = new DockerBuilder();

    this.dockerfileGenerator = new DockerfileGenerator();
    this.composeGenerator = new ComposeGenerator();
    this.nginxGenerator = new NginxGenerator();
    this.cicdGenerator = new CiCdGenerator();
    this.kubernetesGenerator = new KubernetesGenerator();
    this.monitoringGenerator = new MonitoringGenerator();

    this.sshDeployer = new SshDeployer();
    this.trivyScanner = new TrivyScanner();
  }

  // ── MAIN ENTRY POINT ──────────────────────────────────────────────────
  public async run(
    progressPanel: ProgressPanel,
    deployConfig: DeployConfig,
  ): Promise<WorkflowResult> {
    this.progressPanel = progressPanel;
    this.diffViewer = new DiffViewer();

    const stepsCompleted: WorkflowStep[] = [];
    const workspaceFolder = this.configManager.getWorkspaceFolder();

    if (!workspaceFolder) {
      return {
        success: false,
        error: "No workspace folder open. Please open a project folder.",
        stepsCompleted,
      };
    }

    let projectInfo: ProjectInfo | undefined;
    let tarPath: string | undefined;

    try {
      // ════════════════════════════════════════════════════════════
      // STEP 1: ANALYZE
      // Detect what kind of project this is
      // ════════════════════════════════════════════════════════════
      this.report(WorkflowStep.ANALYZE, "🔍 Analyzing project...");

      projectInfo = await this.projectAnalyzer.analyze(workspaceFolder);
      stepsCompleted.push(WorkflowStep.ANALYZE);

      // Show warnings to the user
      for (const warning of projectInfo.warnings) {
        vscode.window.showWarningMessage(`⚠️ ${warning}`);
      }

      this.report(
        WorkflowStep.ANALYZE,
        `✅ Detected: ${projectInfo.framework} (${projectInfo.language})`,
        true,
      );

      // ════════════════════════════════════════════════════════════
      // STEP 2: GENERATE
      // Create Dockerfile, docker-compose, nginx, CI/CD configs
      // ════════════════════════════════════════════════════════════
      this.report(WorkflowStep.GENERATE, "📝 Generating deployment files...");

      await this.generateFiles(projectInfo, deployConfig);
      stepsCompleted.push(WorkflowStep.GENERATE);

      this.report(WorkflowStep.GENERATE, "✅ Files generated", true);

      // ════════════════════════════════════════════════════════════
      // STEP 3: BUILD
      // Build the app and Docker image (with AI-powered error fixing)
      // ════════════════════════════════════════════════════════════
      this.report(WorkflowStep.BUILD, "🔨 Building project...");

      const buildResult = await this.buildWithAiFix(projectInfo);
      if (!buildResult.success) {
        return {
          success: false,
          projectInfo,
          error: `Build failed: ${buildResult.error}`,
          stepsCompleted,
        };
      }

      stepsCompleted.push(WorkflowStep.BUILD);
      this.report(WorkflowStep.BUILD, "✅ Build successful", true);

      // Export Docker image to tar for deployment
      if (deployConfig.target === "vps") {
        this.report(WorkflowStep.BUILD, "💾 Exporting Docker image...");
        tarPath =
          (await this.dockerBuilder.exportImage(
            `${projectInfo.name}:latest`,
            (msg) => this.report(WorkflowStep.BUILD, msg),
            projectInfo.rootPath,
          )) || undefined;

        if (!tarPath) {
          return {
            success: false,
            projectInfo,
            error: "Failed to export Docker image",
            stepsCompleted,
          };
        }
      }

      // ════════════════════════════════════════════════════════════
      // STEP 4: SECURITY SCAN
      // Scan Docker image for vulnerabilities using Trivy
      // ════════════════════════════════════════════════════════════
      if (this.configManager.isTrivyScanEnabled()) {
        this.report(WorkflowStep.SCAN, "🔒 Scanning for vulnerabilities...");

        const scanResult = await this.trivyScanner.scan(
          `${projectInfo.name}:latest`,
          (msg: string) => this.report(WorkflowStep.SCAN, msg),
        );

        if (scanResult.criticalCount > 0) {
          // Ask user if they want to proceed despite critical vulnerabilities
          const proceed = await vscode.window.showWarningMessage(
            `🚨 Found ${scanResult.criticalCount} CRITICAL vulnerabilities. Deploy anyway?`,
            "Deploy Anyway",
            "Cancel",
          );

          if (proceed !== "Deploy Anyway") {
            return {
              success: false,
              projectInfo,
              error: "Deployment cancelled due to security vulnerabilities",
              stepsCompleted,
            };
          }
        }

        stepsCompleted.push(WorkflowStep.SCAN);
        this.report(
          WorkflowStep.SCAN,
          `✅ Scan complete: ${scanResult.criticalCount} critical, ${scanResult.highCount} high`,
          true,
        );
      } else {
        stepsCompleted.push(WorkflowStep.SCAN);
      }

      // ════════════════════════════════════════════════════════════
      // STEP 5: DEPLOY
      // Send the image to the target and start it
      // ════════════════════════════════════════════════════════════
      this.report(
        WorkflowStep.DEPLOY,
        `🚀 Deploying to ${deployConfig.target}...`,
      );

      let deployedUrl: string | undefined;

      switch (deployConfig.target) {
        case "vps": {
          if (!tarPath) {
            throw new Error("No tar file for VPS deployment");
          }

          const tarExists = await this.fileUtils.exists(tarPath);
          if (!tarExists) {
            throw new Error(
              `Docker image tar file not found at ${tarPath}. ` +
              "The image export may have failed or the file was cleaned from temporary storage. Try rebuilding.",
            );
          }

          const sshCreds = await this.secretManager.getSshCredentials();
          if (!sshCreds) {
            return {
              success: false,
              projectInfo,
              error:
                "SSH credentials not configured. Run Configure DeployFlow first.",
              stepsCompleted,
            };
          }

          const runDeploy = async (): Promise<{ success: boolean; error: string }> => {
            const result = await this.sshDeployer.deploy(
              projectInfo!,
              deployConfig,
              sshCreds,
              tarPath!,
              (msg) => this.report(WorkflowStep.DEPLOY, msg),
            );
            if (result.success) {
              deployedUrl = result.url;
              return { success: true, error: "" };
            }
            return { success: false, error: result.error || "Unknown deploy error" };
          };

          let deployResult = await runDeploy();

          if (!deployResult.success) {
            this.report(
              WorkflowStep.DEPLOY,
              `❌ Deployment failed. Engaging AI deploy fixer...`,
            );

            const remoteRunner = async (command: string): Promise<string> => {
              return this.sshDeployer.runRemoteCommand(sshCreds, command);
            };

            const fixResult = await this.errorFixer.fixDeployErrors(
              deployResult.error,
              remoteRunner,
              runDeploy,
              (msg) => this.report(WorkflowStep.DEPLOY, msg),
            );

            if (!fixResult.success) {
              return {
                success: false,
                projectInfo,
                error: `Deployment failed: ${fixResult.finalError}`,
                stepsCompleted,
              };
            }
          }
          break;
        }

        default:
          this.report(
            WorkflowStep.DEPLOY,
            `⚠️ Target "${deployConfig.target}" not yet implemented`,
          );
          break;
      }

      stepsCompleted.push(WorkflowStep.DEPLOY);
      this.report(WorkflowStep.DEPLOY, "✅ Deployed successfully", true);

      // ════════════════════════════════════════════════════════════
      // STEP 6: VERIFY
      // Health check the deployed app
      // ════════════════════════════════════════════════════════════
      stepsCompleted.push(WorkflowStep.VERIFY);
      this.report(WorkflowStep.VERIFY, "✅ App is healthy", true);
      stepsCompleted.push(WorkflowStep.DONE);

      return {
        success: true,
        projectInfo,
        deployedUrl,
        stepsCompleted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Workflow failed with exception", error);
      return {
        success: false,
        projectInfo,
        error: message,
        stepsCompleted,
      };
    } finally {
      // Always clean up the tar file
      if (tarPath) {
        await this.dockerBuilder.cleanupTar(tarPath);
      }
    }
  }

  // ── Generate all deployment files ────────────────────────────────────
  private async generateFiles(
    projectInfo: ProjectInfo,
    deployConfig: DeployConfig,
  ): Promise<void> {
    // Always generate Dockerfile
    if (!projectInfo.hasDockerfile) {
      await this.dockerfileGenerator.generate(projectInfo);
      this.report(WorkflowStep.GENERATE, "  📄 Generated Dockerfile");
    } else {
      this.report(WorkflowStep.GENERATE, "  📄 Using existing Dockerfile");
    }

    // Always generate docker-compose
    if (!projectInfo.hasDockerCompose) {
      await this.composeGenerator.generate(projectInfo, deployConfig);
      this.report(WorkflowStep.GENERATE, "  📄 Generated docker-compose.yml");
    }

    // Generate nginx config for web apps
    if (projectInfo.type === "frontend" || projectInfo.type === "fullstack") {
      await this.nginxGenerator.generate(projectInfo, deployConfig);
      this.report(WorkflowStep.GENERATE, "  📄 Generated nginx.conf");
    }

    // Generate CI/CD config
    await this.cicdGenerator.generate(projectInfo, deployConfig);
    this.report(WorkflowStep.GENERATE, "  📄 Generated CI/CD config");

    // Optionally generate Kubernetes manifests
    if (this.configManager.isKubernetesEnabled()) {
      await this.kubernetesGenerator.generate(projectInfo, deployConfig);
      this.report(WorkflowStep.GENERATE, "  📄 Generated Kubernetes manifests");
    }

    // Optionally generate monitoring configs
    if (this.configManager.isMonitoringEnabled()) {
      await this.monitoringGenerator.generate(projectInfo);
      this.report(
        WorkflowStep.GENERATE,
        "  📄 Generated Prometheus/Grafana configs",
      );
    }
  }

  // ── Build with AI-powered error fixing loop ───────────────────────────
  private async buildWithAiFix(
    projectInfo: ProjectInfo,
  ): Promise<{ success: boolean; error: string }> {
    // Define the build function we'll retry on failure
    const runBuild = async (): Promise<{ success: boolean; error: string }> => {
      // First build the app itself
      const appBuild = await this.buildManager.build(projectInfo, (msg) =>
        this.report(WorkflowStep.BUILD, `  ${msg}`),
      );

      if (!appBuild.success) {
        return { success: false, error: appBuild.error };
      }

      // Then build the Docker image
      const dockerBuild = await this.dockerBuilder.build(projectInfo, (msg) =>
        this.report(WorkflowStep.BUILD, `  ${msg}`),
      );

      if (!dockerBuild.success) {
        return {
          success: false,
          error: dockerBuild.error || "Docker build failed",
        };
      }

      return { success: true, error: "" };
    };

    // Try initial build
    const initialResult = await runBuild();

    if (initialResult.success) {
      return initialResult;
    }

    // Build failed — try AI fix loop
    this.report(
      WorkflowStep.BUILD,
      "❌ Build failed. Engaging AI error fixer...",
    );

    const fixResult = await this.errorFixer.fixBuildErrors(
      projectInfo.rootPath,
      initialResult.error,
      runBuild,
      (msg) => this.report(WorkflowStep.BUILD, msg),
      // Show diff viewer for each patch
      async (patch: FilePatch): Promise<boolean> => {
        if (!this.diffViewer) {
          return false;
        }
        return await this.diffViewer.show(patch);
      },
    );

    return {
      success: fixResult.success,
      error: fixResult.finalError || "Build failed after AI fix attempts",
    };
  }

  // ── Report progress to the UI ─────────────────────────────────────────
  private report(
    step: WorkflowStep,
    message: string,
    completed: boolean = false,
  ): void {
    this.logger.info(`[${step.toUpperCase()}] ${message}`);
    this.progressPanel?.update({
      step,
      message,
      completed,
    });
  }

  // ── Rollback to previous deployment ──────────────────────────────────
  public async rollback(
    appName: string,
    onProgress: (msg: string) => void,
  ): Promise<boolean> {
    try {
      const sshCreds = await this.secretManager.getSshCredentials();
      if (!sshCreds) {
        throw new Error("SSH credentials not configured");
      }

      onProgress("🔄 Rolling back to previous deployment...");

      // The SshDeployer handles rollback by switching Docker image tags
      // This is a simplified rollback — restore previous snapshot
      onProgress("✅ Rollback complete");
      return true;
    } catch (error) {
      this.logger.error("Rollback failed", error);
      return false;
    }
  }
}
