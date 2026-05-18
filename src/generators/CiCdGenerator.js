"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/generators/CiCdGenerator.ts
// Generates CI/CD pipeline configs (GitHub Actions, GitLab CI)
// CI/CD = Continuous Integration / Continuous Deployment
// Automatically runs tests and deploys when you push code
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
exports.CiCdGenerator = void 0;
const path = __importStar(require("path"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class CiCdGenerator {
    fileUtils;
    logger;
    constructor() {
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Generate CI/CD configs ────────────────────────────────────────────
    async generate(projectInfo, deployConfig) {
        this.logger.info("Generating CI/CD configs...");
        // Generate GitHub Actions workflow
        await this.generateGitHubActions(projectInfo, deployConfig);
        // Generate GitLab CI config
        await this.generateGitLabCi(projectInfo, deployConfig);
        this.logger.info("✅ CI/CD configs generated");
    }
    // ── GitHub Actions workflow ───────────────────────────────────────────
    async generateGitHubActions(info, config) {
        const workflowDir = path.join(info.rootPath, ".github", "workflows");
        const workflow = `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated GitHub Actions Workflow
# Framework: ${info.framework}
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════
#
# HOW TO USE:
# 1. Add these secrets to your GitHub repo (Settings → Secrets):
#    - SSH_HOST: Your VPS IP address
#    - SSH_USER: Your SSH username
#    - SSH_PRIVATE_KEY: Your SSH private key
#    - SSH_PORT: Your SSH port (usually 22)
# 2. Push to 'main' branch to trigger deployment
# ─────────────────────────────────────────────────────────────

name: 🚀 Build and Deploy

# When to run this workflow
on:
  push:
    branches: [ main, master ] # Run on push to main
  pull_request:
    branches: [ main, master ] # Run tests on PRs (but don't deploy)
  workflow_dispatch: # Allow manual trigger from GitHub UI

# Environment variables available to all jobs
env:
  APP_NAME: ${config.appName || info.name}
  REGISTRY: ghcr.io  # GitHub Container Registry
  IMAGE_NAME: \${{ github.repository }}

jobs:
  # ── JOB 1: Test ────────────────────────────────────────────────────
  test:
    name: 🧪 Run Tests
    runs-on: ubuntu-latest

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

${this.generateSetupSteps(info)}

      ${info.hasTests
            ? `- name: 🧪 Run tests
        run: ${info.testCommand}`
            : `- name: ⏭️ Skip tests (no tests configured)
        run: echo "No tests configured"`}

  # ── JOB 2: Build Docker Image ──────────────────────────────────────
  build:
    name: 🐳 Build Docker Image
    runs-on: ubuntu-latest
    needs: test # Only run if tests pass

    # Only build on pushes to main (not PRs)
    if: github.event_name == 'push'

    # Output the image tag so the deploy job can use it
    outputs:
      image-tag: \${{ steps.meta.outputs.tags }}

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 🔑 Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: 🏷️ Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: 🔧 Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: 🐳 Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          # Cache layers between builds for speed
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── JOB 3: Security Scan ───────────────────────────────────────────
  scan:
    name: 🔒 Security Scan
    runs-on: ubuntu-latest
    needs: build

    steps:
      - name: 🔍 Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: \${{ needs.build.outputs.image-tag }}
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH

      - name: 📤 Upload scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

  # ── JOB 4: Deploy ──────────────────────────────────────────────────
  deploy:
    name: 🚀 Deploy to Production
    runs-on: ubuntu-latest
    needs: [build, scan]

    # Only deploy on push to main (not PRs)
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'

    # This creates a GitHub "Environment" with deployment tracking
    environment:
      name: production
      url: ${config.domain ? `https://${config.domain}` : "https://your-app.com"}

    steps:
      - name: 🚀 Deploy via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: \${{ secrets.SSH_HOST }}
          username: \${{ secrets.SSH_USER }}
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          port: \${{ secrets.SSH_PORT || 22 }}
          script: |
            # Pull the latest image
            docker pull \${{ needs.build.outputs.image-tag }}
            
            # Stop and remove old container
            docker stop ${config.appName || info.name} || true
            docker rm ${config.appName || info.name} || true
            
            # Start new container
            docker run -d \\
              --name ${config.appName || info.name} \\
              --restart unless-stopped \\
              -p ${info.port}:${info.port} \\
              --memory=512m \\
              \${{ needs.build.outputs.image-tag }}
            
            # Wait for health check
            sleep 10
            docker ps | grep ${config.appName || info.name}
            
            echo "✅ Deployment complete!"

      - name: 💬 Notify on success
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Deployed successfully!'
            })
`;
        await this.fileUtils.writeFile(path.join(workflowDir, "deploy.yml"), workflow);
    }
    // ── GitLab CI config ──────────────────────────────────────────────────
    async generateGitLabCi(info, config) {
        const gitlabCi = `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated GitLab CI/CD
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# Pipeline stages (run in order)
stages:
  - test
  - build
  - scan
  - deploy

variables:
  APP_NAME: "${config.appName || info.name}"
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

# ── Template for Docker-in-Docker ────────────────────────────
.docker-setup: &docker-setup
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY

# ── TEST STAGE ────────────────────────────────────────────────
test:
  stage: test
  ${this.getGitLabImage(info)}
  script:
    ${this.getGitLabInstallCmd(info)}
    ${info.hasTests ? `- ${info.testCommand}` : "- echo 'No tests configured'"}
  only:
    - merge_requests
    - main
    - master

# ── BUILD STAGE ───────────────────────────────────────────────
build-image:
  stage: build
  <<: *docker-setup
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest
    - docker push $CI_REGISTRY_IMAGE:latest
  only:
    - main
    - master

# ── SCAN STAGE ───────────────────────────────────────────────
security-scan:
  stage: scan
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  script:
    - trivy image --exit-code 0 --severity HIGH,CRITICAL $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
    - master

# ── DEPLOY STAGE ─────────────────────────────────────────────
deploy-production:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - mkdir -p ~/.ssh
    - ssh-keyscan $SSH_HOST >> ~/.ssh/known_hosts
  script:
    - ssh $SSH_USER@$SSH_HOST "
        docker pull $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA &&
        docker stop $APP_NAME || true &&
        docker rm $APP_NAME || true &&
        docker run -d
          --name $APP_NAME
          --restart unless-stopped
          -p ${info.port}:${info.port}
          $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
      "
  environment:
    name: production
    url: ${config.domain ? `https://${config.domain}` : "$CI_ENVIRONMENT_URL"}
  only:
    - main
    - master
  when: manual # Require manual approval for production
`;
        await this.fileUtils.writeFile(path.join(info.rootPath, ".gitlab-ci.yml"), gitlabCi);
    }
    // ── Generate setup steps for GitHub Actions ───────────────────────────
    generateSetupSteps(info) {
        if (info.language === "typescript" || info.language === "javascript") {
            return `      - name: ⚙️ Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${info.runtimeVersion || "18"}'
          cache: '${info.packageManager === "yarn" ? "yarn" : info.packageManager === "pnpm" ? "pnpm" : "npm"}'

      - name: 📦 Install dependencies
        run: ${this.getInstallCmd(info)}`;
        }
        if (info.language === "python") {
            return `      - name: ⚙️ Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '${info.runtimeVersion || "3.11"}'
          cache: 'pip'

      - name: 📦 Install dependencies
        run: pip install -r requirements.txt`;
        }
        if (info.language === "go") {
            return `      - name: ⚙️ Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '${info.runtimeVersion || "1.21"}'

      - name: 📦 Download dependencies
        run: go mod download`;
        }
        return `      - name: 📦 Install dependencies
        run: ${this.getInstallCmd(info)}`;
    }
    getInstallCmd(info) {
        switch (info.packageManager) {
            case "yarn":
                return "yarn install --frozen-lockfile";
            case "pnpm":
                return "pnpm install --frozen-lockfile";
            case "bun":
                return "bun install --frozen-lockfile";
            case "pip":
                return "pip install -r requirements.txt";
            case "poetry":
                return "poetry install";
            default:
                return "npm ci";
        }
    }
    getGitLabImage(info) {
        if (info.language === "python")
            return `image: python:${info.runtimeVersion || "3.11"}-slim`;
        if (info.language === "go")
            return `image: golang:${info.runtimeVersion || "1.21"}-alpine`;
        return `image: node:${info.runtimeVersion || "18"}-alpine`;
    }
    getGitLabInstallCmd(info) {
        if (info.language === "python")
            return `- pip install -r requirements.txt`;
        if (info.language === "go")
            return `- go mod download`;
        return `- ${this.getInstallCmd(info)}`;
    }
}
exports.CiCdGenerator = CiCdGenerator;
//# sourceMappingURL=CiCdGenerator.js.map