// ─────────────────────────────────────────────────────────────────────────────
// src/generators/DockerfileGenerator.ts
// Generates multi-stage Dockerfiles for any detected project type
// Multi-stage means: stage 1 = build, stage 2 = production (smaller image)
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { FileUtils } from "../utils/FileUtils";
import { Logger } from "../utils/Logger";

export class DockerfileGenerator {
  private fileUtils: FileUtils;
  private logger: Logger;

  constructor() {
    this.fileUtils = new FileUtils();
    this.logger = Logger.getInstance();
  }

  // ── Generate all Docker-related files ────────────────────────────────
  public async generate(projectInfo: ProjectInfo): Promise<void> {
    this.logger.info("Generating Docker files...");

    // Generate the main Dockerfile
    const dockerfile = this.generateDockerfile(projectInfo);
    await this.fileUtils.writeFile(
      path.join(projectInfo.rootPath, "Dockerfile"),
      dockerfile,
    );

    // Generate .dockerignore (tells Docker which files to skip)
    const dockerignore = this.generateDockerignore(projectInfo);
    await this.fileUtils.writeFile(
      path.join(projectInfo.rootPath, ".dockerignore"),
      dockerignore,
    );

    this.logger.info("✅ Docker files generated");
  }

  // ── Generate the Dockerfile content ──────────────────────────────────
  private generateDockerfile(info: ProjectInfo): string {
    switch (info.language) {
      case "javascript":
      case "typescript":
        return this.generateNodeDockerfile(info);
      case "python":
        return this.generatePythonDockerfile(info);
      case "java":
        return this.generateJavaDockerfile(info);
      case "go":
        return this.generateGoDockerfile(info);
      case "rust":
        return this.generateRustDockerfile(info);
      default:
        return this.generateGenericDockerfile(info);
    }
  }

  // ── Node.js / TypeScript Dockerfile ──────────────────────────────────
  private generateNodeDockerfile(info: ProjectInfo): string {
    const nodeVersion = info.runtimeVersion || "18";
    const packageManager = info.packageManager;

    // Determine install command
    let installCmd: string;
    let ciFlag: string; // ci = clean install (faster, reproducible)
    switch (packageManager) {
      case "yarn":
        installCmd = "yarn";
        ciFlag = "yarn install --frozen-lockfile";
        break;
      case "pnpm":
        installCmd = "pnpm";
        ciFlag = "pnpm ci";
        break;
      case "bun":
        installCmd = "bun";
        ciFlag = "bun install --frozen-lockfile";
        break;
      default:
        installCmd = "npm";
        ciFlag = "npm ci";
        break;
    }

    // For frontend apps, we serve the built files with nginx
    // For backend apps, we run Node.js directly
    const isFrontend = info.type === "frontend";

    if (isFrontend) {
      // Frontend: build with Node, serve with nginx
      return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Frontend
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# ── STAGE 1: BUILD ───────────────────────────────────────────
# Use Node.js to build the frontend assets
FROM node:${nodeVersion}-alpine AS builder

# Set working directory inside the container
# This is where our code will live during the build
WORKDIR /app

# Copy ONLY package files first
# Docker caches layers — if package.json hasn't changed,
# it won't re-run npm install (saves time!)
COPY package*.json ./
${packageManager === "yarn" ? "COPY yarn.lock ./" : ""}
${packageManager === "pnpm" ? "COPY pnpm-lock.yaml ./" : ""}

# Install dependencies
# Using 'ci' instead of 'install' for reproducible installs
RUN ${ciFlag}

# Copy the rest of the source code
COPY . .

# Build the production bundle
RUN ${info.buildCommand || "npm run build"}

# ── STAGE 2: PRODUCTION ──────────────────────────────────────
# Use nginx to serve the built files
# This image is MUCH smaller than the node:alpine image
FROM nginx:alpine AS production

# Copy the built files from Stage 1
# (We leave behind all the node_modules and source — smaller image!)
COPY --from=builder /app/${info.framework === "react-cra" ? "build" : "dist"} /usr/share/nginx/html

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# The port nginx listens on
EXPOSE 80

# Health check — Docker can restart the container if this fails
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# nginx starts automatically, no CMD needed
`;
    } else {
      // Backend: run Node.js directly
      return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Backend
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# ── STAGE 1: BUILD ───────────────────────────────────────────
FROM node:${nodeVersion}-alpine AS builder

WORKDIR /app

COPY package*.json ./
${packageManager === "yarn" ? "COPY yarn.lock ./" : ""}

RUN ${ciFlag}

COPY . .

# Build TypeScript (if applicable)
${info.language === "typescript" ? `RUN ${info.buildCommand || "npm run build"}` : "# No build step for JavaScript"}

# ── STAGE 2: PRODUCTION ──────────────────────────────────────
FROM node:${nodeVersion}-alpine AS production

# Create a non-root user for security
# Running as root is dangerous — if the app is hacked, attacker gets root
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (not devDependencies)
# --omit=dev skips things like typescript, eslint, jest
RUN ${installCmd} install --omit=dev && \\
    # Clean npm cache to reduce image size
    ${installCmd === "npm" ? "npm cache clean --force" : `${installCmd} cache clean`}

# Copy built code from builder stage
${
  info.language === "typescript"
    ? "COPY --from=builder /app/dist ./dist"
    : "COPY --from=builder /app/src ./src"
}

# Set ownership to the non-root user
RUN chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE ${info.port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:${info.port}/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV PORT=${info.port}

# Start the application
CMD [${info.startCommand
        .split(" ")
        .map((s) => `"${s}"`)
        .join(", ")}]
`;
    }
  }

  // ── Python Dockerfile ─────────────────────────────────────────────────
  private generatePythonDockerfile(info: ProjectInfo): string {
    const pythonVersion = info.runtimeVersion || "3.11";
    const isPoetry = info.packageManager === "poetry";

    return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Python
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# ── STAGE 1: BUILD DEPENDENCIES ──────────────────────────────
FROM python:${pythonVersion}-slim AS builder

WORKDIR /app

# Install build tools (needed to compile some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

${
  isPoetry
    ? `
# Install Poetry
RUN pip install poetry==1.7.1

# Copy poetry files
COPY pyproject.toml poetry.lock ./

# Configure poetry: don't create virtual env (we're in Docker already)
RUN poetry config virtualenvs.create false

# Install dependencies
RUN poetry install --no-dev --no-interaction
`
    : `
# Copy requirements file
COPY requirements.txt .

# Install Python dependencies to a specific location
# We'll copy just this location to the production stage
RUN pip install --user --no-cache-dir -r requirements.txt
`
}

# ── STAGE 2: PRODUCTION ──────────────────────────────────────
FROM python:${pythonVersion}-slim AS production

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \\
    adduser --system --uid 1001 --gid 1001 appuser

# Copy installed packages from builder
${
  isPoetry
    ? "COPY --from=builder /usr/local/lib/python${pythonVersion}/site-packages /usr/local/lib/python${pythonVersion}/site-packages"
    : "COPY --from=builder /root/.local /home/appuser/.local"
}

# Copy application code
COPY . .

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE ${info.port}

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \\
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${info.port}/health')" || exit 1

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ${JSON.stringify(info.startCommand.split(" "))}
`;
  }

  // ── Go Dockerfile ─────────────────────────────────────────────────────
  private generateGoDockerfile(info: ProjectInfo): string {
    const goVersion = info.runtimeVersion || "1.21";

    return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Go
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# ── STAGE 1: BUILD ───────────────────────────────────────────
FROM golang:${goVersion}-alpine AS builder

WORKDIR /app

# Download dependencies (cached separately from source)
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source and build
COPY . .

# CGO_ENABLED=0 = no C dependencies (allows scratch image)
# GOOS=linux = compile for Linux
# -ldflags="-s -w" = strip debug info (smaller binary)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o app .

# ── STAGE 2: PRODUCTION (MINIMAL!) ───────────────────────────
# scratch is an EMPTY image — just our binary!
# The Go binary includes everything it needs (static)
# This produces an incredibly small image (~5-10MB)
FROM scratch AS production

# Copy SSL certificates (needed for HTTPS calls)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy just our compiled binary
COPY --from=builder /app/app /app

EXPOSE ${info.port}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD ["/app", "-health"] || exit 1

CMD ["/app"]
`;
  }

  // ── Java/Spring Boot Dockerfile ───────────────────────────────────────
  private generateJavaDockerfile(info: ProjectInfo): string {
    const javaVersion = info.runtimeVersion || "17";
    const isMaven = info.packageManager === "maven";

    return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Java
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# ── STAGE 1: BUILD ───────────────────────────────────────────
FROM eclipse-temurin:${javaVersion}-jdk-alpine AS builder

WORKDIR /app

${
  isMaven
    ? `
# Cache Maven dependencies
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw dependency:go-offline

# Build the application
COPY src ./src
RUN ./mvnw package -DskipTests
`
    : `
# Cache Gradle dependencies
COPY build.gradle* settings.gradle* gradlew ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon

# Build the application
COPY src ./src
RUN ./gradlew build -x test --no-daemon
`
}

# ── STAGE 2: PRODUCTION ──────────────────────────────────────
# Use JRE (runtime only) — smaller than JDK (development kit)
FROM eclipse-temurin:${javaVersion}-jre-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 javagroup && \\
    adduser --system --uid 1001 --gid 1001 javauser

# Copy the JAR from builder
COPY --from=builder /app/${isMaven ? "target" : "build/libs"}/*.jar app.jar

RUN chown -R javauser:javagroup /app

USER javauser

EXPOSE ${info.port}

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:${info.port}/actuator/health || exit 1

# JVM tuning for containers
ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseContainerSupport"

CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
`;
  }

  // ── Rust Dockerfile ───────────────────────────────────────────────────
  private generateRustDockerfile(info: ProjectInfo): string {
    return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated Dockerfile
# Framework: ${info.framework} | Type: Rust
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

FROM rust:alpine AS builder

WORKDIR /app

# Install musl for static linking
RUN apk add --no-cache musl-dev

# Cache dependencies (Cargo.toml trick)
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Build the real application
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Minimal production image ──────────────────────────────────
FROM scratch

COPY --from=builder /app/target/release/${info.name || "app"} /app

EXPOSE ${info.port}

CMD ["/app"]
`;
  }

  // ── Generic fallback Dockerfile ───────────────────────────────────────
  private generateGenericDockerfile(info: ProjectInfo): string {
    return `# DeployFlow AI Generated Dockerfile (Generic)
FROM ubuntu:22.04

WORKDIR /app

COPY . .

EXPOSE ${info.port}

# TODO: Add your specific build and start commands
# CMD ["your-start-command"]
`;
  }

  // ── Generate .dockerignore ────────────────────────────────────────────
  // Lists files/folders Docker should NOT copy into the image
  // This keeps images smaller and build faster
  private generateDockerignore(info: ProjectInfo): string {
    const baseIgnores = [
      "# DeployFlow AI Generated .dockerignore",
      "",
      "# Version control",
      ".git",
      ".gitignore",
      "",
      "# Dependencies (will be re-installed in Docker)",
      "node_modules",
      "__pycache__",
      "*.pyc",
      ".venv",
      "venv",
      "vendor",
      "",
      "# Build artifacts",
      "dist",
      "build",
      "out",
      "*.class",
      "target/debug",
      "",
      "# Environment files (security!)",
      ".env",
      ".env.local",
      ".env.*.local",
      "",
      "# IDE files",
      ".vscode",
      ".idea",
      "*.swp",
      "",
      "# Docker files (no need to copy themselves)",
      "Dockerfile*",
      "docker-compose*",
      "",
      "# DeployFlow files",
      ".deployflow",
      "",
      "# OS files",
      ".DS_Store",
      "Thumbs.db",
      "",
      "# Logs",
      "*.log",
      "logs",
      "",
      "# Test files",
      "coverage",
      ".nyc_output",
      "*.test.ts",
      "*.spec.ts",
      "__tests__",
    ];

    return baseIgnores.join("\n");
  }
}
