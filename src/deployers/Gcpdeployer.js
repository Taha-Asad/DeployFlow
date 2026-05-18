"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/deployers/GcpDeployer.ts
// Deploy Docker containers to Google Cloud Run (serverless containers)
// Flow: push image to Artifact Registry → deploy to Cloud Run
// ────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.GcpDeployer = void 0;
const BaseDeployer_1 = require("./BaseDeployer");
const ShellUtils_1 = require("../utils/ShellUtils");
class GcpDeployer extends BaseDeployer_1.BaseDeployer {
    shell;
    constructor() {
        super();
        this.shell = new ShellUtils_1.ShellUtils();
    }
    async deploy(projectInfo, config, credentials, onProgress) {
        try {
            this.validateCredentials(credentials, ["GCP_PROJECT_ID", "GCP_REGION"]);
            const projectId = credentials["GCP_PROJECT_ID"] || config.projectId;
            const region = credentials["GCP_REGION"] || "us-central1";
            const appName = (config.appName || projectInfo.name)
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-");
            const registryHost = `${region}-docker.pkg.dev`;
            const imageTag = `${registryHost}/${projectId}/${appName}/${appName}:latest`;
            // ── 1. Ensure gcloud CLI ───────────────────────────────────────────
            const gcloudExists = await this.shell.commandExists("gcloud");
            if (!gcloudExists) {
                throw new Error("gcloud CLI is not installed. Install from: https://cloud.google.com/sdk");
            }
            // ── 2. Authenticate (service account key if provided) ─────────────
            if (credentials["GCP_SA_KEY_FILE"]) {
                onProgress("🔑 Authenticating with GCP service account...");
                await this.shell.run(`gcloud auth activate-service-account --key-file=${credentials["GCP_SA_KEY_FILE"]}`);
            }
            // ── 3. Configure Docker to use gcloud auth ────────────────────────
            onProgress(`🔑 Configuring Docker for ${registryHost}...`);
            await this.shell.run(`gcloud auth configure-docker ${registryHost} --quiet`);
            // ── 4. Create Artifact Registry repo if needed ────────────────────
            onProgress("📦 Ensuring Artifact Registry repository exists...");
            await this.shell.run(`gcloud artifacts repositories describe ${appName} ` +
                `--location=${region} --project=${projectId} || ` +
                `gcloud artifacts repositories create ${appName} ` +
                `--repository-format=docker --location=${region} --project=${projectId}`);
            // ── 5. Tag and push image ─────────────────────────────────────────
            onProgress(`📤 Pushing image to Artifact Registry...`);
            await this.shell.run(`docker tag ${appName}:latest ${imageTag}`);
            const pushResult = await this.shell.runStreaming("docker", ["push", imageTag], { onOutput: (l) => onProgress(`  ${l}`), timeout: 600000 });
            if (!pushResult.success)
                throw new Error("Docker push failed");
            // ── 6. Deploy to Cloud Run ─────────────────────────────────────────
            onProgress("🚀 Deploying to Cloud Run...");
            const deployResult = await this.shell.run(`gcloud run deploy ${appName} ` +
                `--image=${imageTag} ` +
                `--platform=managed ` +
                `--region=${region} ` +
                `--project=${projectId} ` +
                `--allow-unauthenticated ` +
                `--port=${projectInfo.port} ` +
                `--memory=512Mi ` +
                `--cpu=1 ` +
                `--min-instances=0 ` +
                `--max-instances=10 ` +
                `--quiet`);
            if (!deployResult.success) {
                throw new Error(`Cloud Run deploy failed: ${deployResult.stderr}`);
            }
            // ── 7. Get the deployed URL ────────────────────────────────────────
            const urlResult = await this.shell.run(`gcloud run services describe ${appName} ` +
                `--region=${region} --project=${projectId} ` +
                `--format="value(status.url)"`);
            const deployedUrl = urlResult.stdout.trim() || `https://${appName}-${projectId}.run.app`;
            onProgress(`✅ Deployed to Cloud Run: ${deployedUrl}`);
            await this.waitForDeployment(deployedUrl, onProgress);
            return { success: true, url: deployedUrl };
        }
        catch (error) {
            return this.errorResult(error);
        }
    }
}
exports.GcpDeployer = GcpDeployer;
//# sourceMappingURL=Gcpdeployer.js.map