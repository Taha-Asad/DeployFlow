// ────────────────────────────────────────────────────────────────────────────
// src/deployers/AwsDeployer.ts
// Deploy Docker containers to AWS ECS (Elastic Container Service) via Fargate
// Flow: push image to ECR → update ECS task definition → force new deployment
// ────────────────────────────────────────────────────────────────────────────

import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";

export class AwsDeployer extends BaseDeployer {
  private shell: ShellUtils;

  constructor() {
    super();
    this.shell = new ShellUtils();
  }

  public async deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: Record<string, string>,
    onProgress: (msg: string) => void,
  ): Promise<DeployResult> {
    try {
      this.validateCredentials(credentials, [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_REGION",
      ]);

      const region = credentials["AWS_REGION"] || "us-east-1";
      const accountId = credentials["AWS_ACCOUNT_ID"];
      const appName = config.appName || projectInfo.name;
      const clusterName = credentials["ECS_CLUSTER"] || `${appName}-cluster`;
      const serviceName = credentials["ECS_SERVICE"] || `${appName}-service`;

      const env: Record<string, string> = {
        AWS_ACCESS_KEY_ID: credentials["AWS_ACCESS_KEY_ID"],
        AWS_SECRET_ACCESS_KEY: credentials["AWS_SECRET_ACCESS_KEY"],
        AWS_DEFAULT_REGION: region,
      };

      // ── 1. Ensure AWS CLI ──────────────────────────────────────────────
      const awsExists = await this.shell.commandExists("aws");
      if (!awsExists) {
        throw new Error(
          "AWS CLI is not installed. Install it from: https://aws.amazon.com/cli/",
        );
      }

      // ── 2. Get AWS account ID if not provided ─────────────────────────
      let awsAccountId = accountId;
      if (!awsAccountId) {
        onProgress("🔍 Fetching AWS account ID...");
        const idResult = await this.shell.run(
          "aws sts get-caller-identity --query Account --output text",
          { env },
        );
        if (!idResult.success) throw new Error("Failed to get AWS account ID");
        awsAccountId = idResult.stdout.trim();
      }

      const ecrRepo = `${awsAccountId}.dkr.ecr.${region}.amazonaws.com/${appName}`;

      // ── 3. Authenticate Docker with ECR ───────────────────────────────
      onProgress("🔑 Authenticating with ECR...");
      const loginResult = await this.shell.run(
        `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${awsAccountId}.dkr.ecr.${region}.amazonaws.com`,
        { env },
      );
      if (!loginResult.success) throw new Error("ECR login failed");

      // ── 4. Create ECR repository if it doesn't exist ──────────────────
      onProgress("📦 Ensuring ECR repository exists...");
      await this.shell.run(
        `aws ecr describe-repositories --repository-names ${appName} --region ${region} || ` +
          `aws ecr create-repository --repository-name ${appName} --region ${region}`,
        { env },
      );

      // ── 5. Tag and push Docker image ──────────────────────────────────
      const imageTag = `${ecrRepo}:latest`;
      onProgress(`📤 Pushing image to ECR: ${imageTag}`);

      await this.shell.run(`docker tag ${appName}:latest ${imageTag}`);
      const pushResult = await this.shell.runStreaming(
        "docker",
        ["push", imageTag],
        { onOutput: (l) => onProgress(`  ${l}`), timeout: 600000 },
      );
      if (!pushResult.success) throw new Error("Docker push to ECR failed");

      // ── 6. Update ECS service to use new image ─────────────────────────
      onProgress(`⚙️ Updating ECS service: ${serviceName}...`);
      const updateResult = await this.shell.run(
        `aws ecs update-service ` +
          `--cluster ${clusterName} ` +
          `--service ${serviceName} ` +
          `--force-new-deployment ` +
          `--region ${region}`,
        { env },
      );

      if (!updateResult.success) {
        throw new Error(`ECS update failed: ${updateResult.stderr}`);
      }

      // ── 7. Wait for service to stabilize ──────────────────────────────
      onProgress("⏳ Waiting for ECS deployment to stabilize...");
      await this.shell.run(
        `aws ecs wait services-stable ` +
          `--cluster ${clusterName} ` +
          `--services ${serviceName} ` +
          `--region ${region}`,
        { env, timeout: 600000 },
      );

      const deployedUrl = config.domain
        ? `https://${config.domain}`
        : `http://${appName}.${region}.elb.amazonaws.com`;

      onProgress(`✅ Deployed to AWS ECS: ${deployedUrl}`);

      return { success: true, url: deployedUrl };
    } catch (error) {
      return this.errorResult(error);
    }
  }
}
