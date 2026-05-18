"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/deployers/AzureDeployer.ts
// Deploy Docker containers to Azure Container Apps
// Flow: push to ACR → deploy/update Container App
// ────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureDeployer = void 0;
const BaseDeployer_1 = require("./BaseDeployer");
const ShellUtils_1 = require("../utils/ShellUtils");
class AzureDeployer extends BaseDeployer_1.BaseDeployer {
    shell;
    constructor() {
        super();
        this.shell = new ShellUtils_1.ShellUtils();
    }
    async deploy(projectInfo, config, credentials, onProgress) {
        try {
            this.validateCredentials(credentials, [
                "AZURE_CLIENT_ID",
                "AZURE_CLIENT_SECRET",
                "AZURE_TENANT_ID",
                "AZURE_SUBSCRIPTION_ID",
                "AZURE_RESOURCE_GROUP",
                "AZURE_ACR_NAME",
            ]);
            const resourceGroup = credentials["AZURE_RESOURCE_GROUP"] ||
                config.resourceGroup ||
                "deployflow-rg";
            const acrName = credentials["AZURE_ACR_NAME"];
            const appName = (config.appName || projectInfo.name)
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-");
            const acrLoginServer = `${acrName}.azurecr.io`;
            const imageTag = `${acrLoginServer}/${appName}:latest`;
            // ── 1. Ensure Azure CLI ────────────────────────────────────────────
            const azExists = await this.shell.commandExists("az");
            if (!azExists) {
                throw new Error("Azure CLI is not installed. Install from: https://docs.microsoft.com/cli/azure/install-azure-cli");
            }
            // ── 2. Login to Azure ──────────────────────────────────────────────
            onProgress("🔑 Logging in to Azure...");
            const loginResult = await this.shell.run(`az login --service-principal ` +
                `--username ${credentials["AZURE_CLIENT_ID"]} ` +
                `--password ${credentials["AZURE_CLIENT_SECRET"]} ` +
                `--tenant ${credentials["AZURE_TENANT_ID"]}`);
            if (!loginResult.success)
                throw new Error("Azure login failed");
            await this.shell.run(`az account set --subscription ${credentials["AZURE_SUBSCRIPTION_ID"]}`);
            // ── 3. Login to ACR ────────────────────────────────────────────────
            onProgress(`🔑 Logging in to ACR: ${acrName}...`);
            await this.shell.run(`az acr login --name ${acrName}`);
            // ── 4. Push image ──────────────────────────────────────────────────
            onProgress(`📤 Pushing image to ACR: ${imageTag}...`);
            await this.shell.run(`docker tag ${appName}:latest ${imageTag}`);
            const pushResult = await this.shell.runStreaming("docker", ["push", imageTag], { onOutput: (l) => onProgress(`  ${l}`), timeout: 600000 });
            if (!pushResult.success)
                throw new Error("Docker push to ACR failed");
            // ── 5. Create or update Container App ─────────────────────────────
            onProgress("🚀 Deploying to Azure Container Apps...");
            // Check if container app already exists
            const existsResult = await this.shell.run(`az containerapp show --name ${appName} --resource-group ${resourceGroup} --query name -o tsv`);
            let deployedUrl;
            if (existsResult.success) {
                // Update existing container app
                const updateResult = await this.shell.run(`az containerapp update ` +
                    `--name ${appName} ` +
                    `--resource-group ${resourceGroup} ` +
                    `--image ${imageTag}`);
                if (!updateResult.success)
                    throw new Error("Container App update failed");
            }
            else {
                // Create new container app with Container Apps Environment
                const envName = `${appName}-env`;
                // Create environment if not exists
                await this.shell.run(`az containerapp env show --name ${envName} --resource-group ${resourceGroup} || ` +
                    `az containerapp env create --name ${envName} --resource-group ${resourceGroup} --location eastus`);
                const createResult = await this.shell.run(`az containerapp create ` +
                    `--name ${appName} ` +
                    `--resource-group ${resourceGroup} ` +
                    `--environment ${envName} ` +
                    `--image ${imageTag} ` +
                    `--target-port ${projectInfo.port} ` +
                    `--ingress external ` +
                    `--registry-server ${acrLoginServer} ` +
                    `--min-replicas 1 ` +
                    `--max-replicas 10 ` +
                    `--cpu 0.5 ` +
                    `--memory 1.0Gi`);
                if (!createResult.success)
                    throw new Error("Container App creation failed");
            }
            // ── 6. Get deployed URL ────────────────────────────────────────────
            const fqdnResult = await this.shell.run(`az containerapp show --name ${appName} --resource-group ${resourceGroup} ` +
                `--query properties.configuration.ingress.fqdn -o tsv`);
            deployedUrl = fqdnResult.success
                ? `https://${fqdnResult.stdout.trim()}`
                : `https://${appName}.azurecontainerapps.io`;
            onProgress(`✅ Deployed to Azure Container Apps: ${deployedUrl}`);
            await this.waitForDeployment(deployedUrl, onProgress);
            return { success: true, url: deployedUrl };
        }
        catch (error) {
            return this.errorResult(error);
        }
    }
}
exports.AzureDeployer = AzureDeployer;
//# sourceMappingURL=Azuredeployer.js.map