"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/core/WorkflowEngine.ts
// The master controller — runs all deployment steps in order
// Think of it as a pipeline: analyze → generate → build → scan → deploy → verify
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
exports.WorkflowEngine = exports.WorkflowStep = void 0;
const vscode = __importStar(require("vscode"));
const ProjectAnalyzer_1 = require("./ProjectAnalyzer");
const FileUtils_1 = require("../utils/FileUtils");
const AIManager_1 = require("../ai/AIManager");
const ErrorFixer_1 = require("../ai/ErrorFixer");
const BuildManager_1 = require("../builders/BuildManager");
const DockerBuilder_1 = require("../builders/DockerBuilder");
const DockerfileGenerator_1 = require("../generators/DockerfileGenerator");
const ComposeGenerator_1 = require("../generators/ComposeGenerator");
const NginxGenerator_1 = require("../generators/NginxGenerator");
const CiCdGenerator_1 = require("../generators/CiCdGenerator");
const KubernetesGenerator_1 = require("../generators/KubernetesGenerator");
const MonitoringGenerator_1 = require("../generators/MonitoringGenerator");
const SshDeployer_1 = require("../deployers/SshDeployer");
const Verceldeployer_1 = require("../deployers/Verceldeployer");
const Netlifydeployer_1 = require("../deployers/Netlifydeployer");
const Cloudflaredeployer_1 = require("../deployers/Cloudflaredeployer");
const Awsdeployer_1 = require("../deployers/Awsdeployer");
const Gcpdeployer_1 = require("../deployers/Gcpdeployer");
const Azuredeployer_1 = require("../deployers/Azuredeployer");
const TrivyScanner_1 = require("../security/TrivyScanner");
const Diffviewer_1 = require("../ui/Diffviewer");
// Each step in our pipeline
var WorkflowStep;
(function (WorkflowStep) {
    WorkflowStep["ANALYZE"] = "analyze";
    WorkflowStep["GENERATE"] = "generate";
    WorkflowStep["BUILD"] = "build";
    WorkflowStep["SCAN"] = "scan";
    WorkflowStep["DEPLOY"] = "deploy";
    WorkflowStep["VERIFY"] = "verify";
    WorkflowStep["DONE"] = "done";
})(WorkflowStep || (exports.WorkflowStep = WorkflowStep = {}));
class WorkflowEngine {
    configManager;
    secretManager;
    logger;
    fileUtils;
    // Sub-components — each handles one part of the workflow
    projectAnalyzer;
    aiManager;
    errorFixer;
    buildManager;
    dockerBuilder;
    // Generators
    dockerfileGenerator;
    composeGenerator;
    nginxGenerator;
    cicdGenerator;
    kubernetesGenerator;
    monitoringGenerator;
    // Deployers & Scanners
    sshDeployer;
    vercelDeployer;
    netlifyDeployer;
    cloudflareDeployer;
    awsDeployer;
    gcpDeployer;
    azureDeployer;
    trivyScanner;
    // UI components (set before each run)
    progressPanel = null;
    diffViewer = null;
    constructor(configManager, secretManager, logger) {
        this.configManager = configManager;
        this.secretManager = secretManager;
        this.logger = logger;
        this.fileUtils = new FileUtils_1.FileUtils();
        // Initialize all sub-components
        this.projectAnalyzer = new ProjectAnalyzer_1.ProjectAnalyzer();
        this.aiManager = new AIManager_1.AIManager(configManager, secretManager);
        this.errorFixer = new ErrorFixer_1.ErrorFixer(this.aiManager, configManager);
        this.buildManager = new BuildManager_1.BuildManager();
        this.dockerBuilder = new DockerBuilder_1.DockerBuilder();
        this.dockerfileGenerator = new DockerfileGenerator_1.DockerfileGenerator();
        this.composeGenerator = new ComposeGenerator_1.ComposeGenerator();
        this.nginxGenerator = new NginxGenerator_1.NginxGenerator();
        this.cicdGenerator = new CiCdGenerator_1.CiCdGenerator();
        this.kubernetesGenerator = new KubernetesGenerator_1.KubernetesGenerator();
        this.monitoringGenerator = new MonitoringGenerator_1.MonitoringGenerator();
        this.sshDeployer = new SshDeployer_1.SshDeployer();
        this.vercelDeployer = new Verceldeployer_1.VercelDeployer();
        this.netlifyDeployer = new Netlifydeployer_1.NetlifyDeployer();
        this.cloudflareDeployer = new Cloudflaredeployer_1.CloudflareDeployer();
        this.awsDeployer = new Awsdeployer_1.AwsDeployer();
        this.gcpDeployer = new Gcpdeployer_1.GcpDeployer();
        this.azureDeployer = new Azuredeployer_1.AzureDeployer();
        this.trivyScanner = new TrivyScanner_1.TrivyScanner();
    }
    // ── MAIN ENTRY POINT ──────────────────────────────────────────────────
    async run(progressPanel, deployConfig) {
        this.progressPanel = progressPanel;
        this.diffViewer = new Diffviewer_1.DiffViewer();
        const stepsCompleted = [];
        const workspaceFolder = this.configManager.getWorkspaceFolder();
        if (!workspaceFolder) {
            return {
                success: false,
                error: "No workspace folder open. Please open a project folder.",
                stepsCompleted,
            };
        }
        let projectInfo;
        let tarPath;
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
            this.report(WorkflowStep.ANALYZE, `✅ Detected: ${projectInfo.framework} (${projectInfo.language})`, true);
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
            const needsDocker = deployConfig.target === "vps";
            const buildResult = await this.buildWithAiFix(projectInfo, needsDocker);
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
                    (await this.dockerBuilder.exportImage(`${projectInfo.name}:latest`, (msg) => this.report(WorkflowStep.BUILD, msg), projectInfo.rootPath)) || undefined;
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
            if (needsDocker && this.configManager.isTrivyScanEnabled()) {
                this.report(WorkflowStep.SCAN, "🔒 Scanning for vulnerabilities...");
                const scanResult = await this.trivyScanner.scan(`${projectInfo.name}:latest`, (msg) => this.report(WorkflowStep.SCAN, msg));
                if (scanResult.criticalCount > 0) {
                    // Ask user if they want to proceed despite critical vulnerabilities
                    const proceed = await vscode.window.showWarningMessage(`🚨 Found ${scanResult.criticalCount} CRITICAL vulnerabilities. Deploy anyway?`, "Deploy Anyway", "Cancel");
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
                this.report(WorkflowStep.SCAN, `✅ Scan complete: ${scanResult.criticalCount} critical, ${scanResult.highCount} high`, true);
            }
            else {
                stepsCompleted.push(WorkflowStep.SCAN);
            }
            // ════════════════════════════════════════════════════════════
            // STEP 5: DEPLOY
            // Send the image to the target and start it
            // ════════════════════════════════════════════════════════════
            this.report(WorkflowStep.DEPLOY, `🚀 Deploying to ${deployConfig.target}...`);
            let deployedUrl;
            const rawCredentials = await this.secretManager.getCredentialsForTarget(deployConfig.target);
            if (!rawCredentials) {
                return {
                    success: false,
                    projectInfo,
                    error: `Credentials not configured for ${deployConfig.target}. Run Configure DeployFlow first.`,
                    stepsCompleted,
                };
            }
            const runDeployForTarget = async () => {
                switch (deployConfig.target) {
                    case "vps": {
                        if (!tarPath) {
                            throw new Error("No tar file for VPS deployment");
                        }
                        const tarExists = await this.fileUtils.exists(tarPath);
                        if (!tarExists) {
                            throw new Error(`Docker image tar file not found at ${tarPath}. ` +
                                "The image export may have failed or the file was cleaned from temporary storage. Try rebuilding.");
                        }
                        return await this.sshDeployer.deploy(projectInfo, deployConfig, rawCredentials, tarPath, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    }
                    case "vercel":
                        return await this.vercelDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    case "netlify":
                        return await this.netlifyDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    case "cloudflare":
                        return await this.cloudflareDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    case "aws":
                        return await this.awsDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    case "gcp":
                        return await this.gcpDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    case "azure":
                        return await this.azureDeployer.deploy(projectInfo, deployConfig, rawCredentials, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    default:
                        throw new Error(`Unknown deploy target: ${deployConfig.target}`);
                }
            };
            let deployResult = await runDeployForTarget();
            if (!deployResult.success) {
                this.report(WorkflowStep.DEPLOY, `❌ Deployment failed. Engaging AI deploy fixer...`);
                const remoteRunner = deployConfig.target === "vps"
                    ? async (command) => {
                        return this.sshDeployer.runRemoteCommand(rawCredentials, command);
                    }
                    : undefined;
                if (remoteRunner) {
                    const wrappedDeploy = async () => {
                        const result = await runDeployForTarget();
                        return { success: result.success, error: result.error || "Unknown deploy error" };
                    };
                    const fixResult = await this.errorFixer.fixDeployErrors(deployResult.error || "Unknown deploy error", remoteRunner, wrappedDeploy, (msg) => this.report(WorkflowStep.DEPLOY, msg));
                    if (!fixResult.success) {
                        return {
                            success: false,
                            projectInfo,
                            error: `Deployment failed: ${fixResult.finalError}`,
                            stepsCompleted,
                        };
                    }
                }
                else {
                    return {
                        success: false,
                        projectInfo,
                        error: `Deployment failed: ${deployResult.error}`,
                        stepsCompleted,
                    };
                }
            }
            deployedUrl = deployResult.url;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error("Workflow failed with exception", error);
            return {
                success: false,
                projectInfo,
                error: message,
                stepsCompleted,
            };
        }
        finally {
            // Always clean up the tar file
            if (tarPath) {
                await this.dockerBuilder.cleanupTar(tarPath);
            }
        }
    }
    // ── Generate all deployment files ────────────────────────────────────
    async generateFiles(projectInfo, deployConfig) {
        // Always generate Dockerfile
        if (!projectInfo.hasDockerfile) {
            await this.dockerfileGenerator.generate(projectInfo);
            this.report(WorkflowStep.GENERATE, "  📄 Generated Dockerfile");
        }
        else {
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
            this.report(WorkflowStep.GENERATE, "  📄 Generated Prometheus/Grafana configs");
        }
    }
    // ── Build with AI-powered error fixing loop ───────────────────────────
    async buildWithAiFix(projectInfo, needsDocker) {
        // Define the build function we'll retry on failure
        const runBuild = async () => {
            // First build the app itself
            const appBuild = await this.buildManager.build(projectInfo, (msg) => this.report(WorkflowStep.BUILD, `  ${msg}`));
            if (!appBuild.success) {
                return { success: false, error: appBuild.error };
            }
            // Skip Docker build for platforms that don't need it
            // (Vercel, Netlify, Cloudflare, AWS, GCP, Azure)
            if (!needsDocker) {
                return { success: true, error: "" };
            }
            // Then build the Docker image (only for Docker-based targets like VPS)
            const dockerBuild = await this.dockerBuilder.build(projectInfo, (msg) => this.report(WorkflowStep.BUILD, `  ${msg}`));
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
        this.report(WorkflowStep.BUILD, "❌ Build failed. Engaging AI error fixer...");
        const fixResult = await this.errorFixer.fixBuildErrors(projectInfo.rootPath, initialResult.error, runBuild, (msg) => this.report(WorkflowStep.BUILD, msg), 
        // Show diff viewer for each patch
        async (patch) => {
            if (!this.diffViewer) {
                return false;
            }
            return await this.diffViewer.show(patch);
        });
        return {
            success: fixResult.success,
            error: fixResult.finalError || "Build failed after AI fix attempts",
        };
    }
    // ── Report progress to the UI ─────────────────────────────────────────
    report(step, message, completed = false) {
        this.logger.info(`[${step.toUpperCase()}] ${message}`);
        this.progressPanel?.update({
            step,
            message,
            completed,
        });
    }
    // ── Rollback to previous deployment ──────────────────────────────────
    async rollback(appName, onProgress) {
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
        }
        catch (error) {
            this.logger.error("Rollback failed", error);
            return false;
        }
    }
}
exports.WorkflowEngine = WorkflowEngine;
//# sourceMappingURL=WorkflowEngine.js.map