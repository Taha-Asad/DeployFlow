// ─────────────────────────────────────────────────────────────────────────────
// src/generators/ComposeGenerator.ts
// Generates docker-compose.yml for local development and production
// docker-compose lets you run multiple containers together (app + database)
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import * as yaml from "js-yaml";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { FileUtils } from "../utils/FileUtils";
import { Logger } from "../utils/Logger";

export class ComposeGenerator {
  private fileUtils: FileUtils;
  private logger: Logger;

  constructor() {
    this.fileUtils = new FileUtils();
    this.logger = Logger.getInstance();
  }

  // ── Generate docker-compose.yml ───────────────────────────────────────
  public async generate(
    projectInfo: ProjectInfo,
    deployConfig: DeployConfig,
  ): Promise<void> {
    this.logger.info("Generating docker-compose.yml...");

    const compose = this.buildComposeConfig(projectInfo, deployConfig);

    // js-yaml converts a JavaScript object to YAML format
    const yamlContent =
      `# ═══════════════════════════════════════════════════════════\n` +
      `# DeployFlow AI Generated docker-compose.yml\n` +
      `# Framework: ${projectInfo.framework}\n` +
      `# Generated: ${new Date().toISOString()}\n` +
      `# ═══════════════════════════════════════════════════════════\n\n` +
      yaml.dump(compose, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

    await this.fileUtils.writeFile(
      path.join(projectInfo.rootPath, "docker-compose.yml"),
      yamlContent,
    );

    // Also generate a dev-specific compose file
    const devCompose = this.buildDevComposeConfig(projectInfo);
    const devYaml =
      `# docker-compose.dev.yml — for local development\n` +
      `# Run with: docker-compose -f docker-compose.yml -f docker-compose.dev.yml up\n\n` +
      yaml.dump(devCompose, { indent: 2 });

    await this.fileUtils.writeFile(
      path.join(projectInfo.rootPath, "docker-compose.dev.yml"),
      devYaml,
    );

    this.logger.info("✅ docker-compose.yml generated");
  }

  // ── Build the production compose config object ────────────────────────
  private buildComposeConfig(
    info: ProjectInfo,
    config: DeployConfig,
  ): Record<string, unknown> {
    const appName = config.appName || info.name;

    // Start with the base app service
    const services: Record<string, unknown> = {
      [appName]: {
        image: `${appName}:latest`,
        // `build: .` means build from local Dockerfile
        build: {
          context: ".",
          dockerfile: "Dockerfile",
          // Build-time arguments
          args: {
            NODE_ENV: "production",
          },
        },
        restart: "unless-stopped",
        ports: [`${info.port}:${info.port}`],
        environment: this.buildEnvVars(info),
        // Connect to our custom network
        networks: ["app-network"],
        // Resource limits prevent one container from hogging everything
        deploy: {
          resources: {
            limits: {
              cpus: "0.5",
              memory: "512M",
            },
            reservations: {
              memory: "128M",
            },
          },
        },
        // Health check
        healthcheck: {
          test: [
            "CMD",
            "wget",
            "--no-verbose",
            "--tries=1",
            "--spider",
            `http://localhost:${info.port}/health`,
          ],
          interval: "30s",
          timeout: "10s",
          retries: 3,
          start_period: "30s",
        },
        // Log configuration
        logging: {
          driver: "json-file",
          options: {
            "max-size": "10m",
            "max-file": "3",
          },
        },
      },
    };

    // Add nginx reverse proxy
    services["nginx"] = {
      image: "nginx:alpine",
      restart: "unless-stopped",
      ports: ["80:80", "443:443"],
      volumes: [
        "./nginx.conf:/etc/nginx/nginx.conf:ro",
        // SSL certificates volume (if using Let's Encrypt)
        "ssl-certs:/etc/letsencrypt:ro",
        // nginx logs
        "./logs/nginx:/var/log/nginx",
      ],
      depends_on: {
        [appName]: {
          condition: "service_healthy",
        },
      },
      networks: ["app-network"],
    };

    // Add database if the project seems to need one
    const needsDatabase = this.detectDatabaseNeed(info);
    if (needsDatabase.needed) {
      services["db"] = this.buildDatabaseService(needsDatabase.type);
      // Make the app depend on the database
      const appService = services[appName] as Record<string, unknown>;
      appService.depends_on = {
        db: { condition: "service_healthy" },
      };
    }

    // Add Redis if needed (for session/cache)
    if (this.detectRedisNeed(info)) {
      services["redis"] = {
        image: "redis:7-alpine",
        restart: "unless-stopped",
        command: "redis-server --appendonly yes",
        volumes: ["redis-data:/data"],
        networks: ["app-network"],
        healthcheck: {
          test: ["CMD", "redis-cli", "ping"],
          interval: "10s",
          timeout: "5s",
          retries: 5,
        },
      };
    }

    // Build volumes list
    const volumes: Record<string, unknown> = {
      "ssl-certs": {},
    };

    if (needsDatabase.needed) {
      volumes["db-data"] = {};
    }

    if (this.detectRedisNeed(info)) {
      volumes["redis-data"] = {};
    }

    return {
      // Compose file version
      version: "3.8",
      services,
      networks: {
        "app-network": {
          driver: "bridge",
        },
      },
      volumes,
    };
  }

  // ── Build dev-specific overrides ──────────────────────────────────────
  private buildDevComposeConfig(info: ProjectInfo): Record<string, unknown> {
    return {
      version: "3.8",
      services: {
        [info.name]: {
          // In dev, build from source instead of using pre-built image
          build: {
            target: "builder", // Use the build stage, not production
          },
          // Mount source code so changes are reflected immediately
          volumes: [".:/app", "/app/node_modules"],
          environment: {
            NODE_ENV: "development",
          },
          // Override start command with dev server
          command:
            info.packageManager === "npm"
              ? "npm run dev"
              : `${info.packageManager} dev`,
          // Expose more ports in dev
          ports: [
            `${info.port}:${info.port}`,
            "9229:9229", // Node.js debugger port
          ],
        },
      },
    };
  }

  // ── Build environment variables for the compose file ─────────────────
  private buildEnvVars(info: ProjectInfo): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: "production",
      PORT: String(info.port),
    };

    // Reference each env var but don't expose actual values
    // Use ${VAR_NAME} syntax to read from the host environment
    for (const varName of info.envVars) {
      if (varName !== "PORT" && varName !== "NODE_ENV") {
        // ${VARIABLE:-default} = use VARIABLE, or "default" if not set
        env[varName] = `\${${varName}}`;
      }
    }

    return env;
  }

  // ── Detect if the project needs a database ────────────────────────────
  private detectDatabaseNeed(info: ProjectInfo): {
    needed: boolean;
    type: "postgres" | "mysql" | "mongodb";
  } {
    const indicators = [
      ...info.envVars,
      JSON.stringify(info.files.packageJson || {}),
      info.files.requirementsTxt || "",
    ]
      .join(" ")
      .toLowerCase();

    if (indicators.includes("mongo")) {
      return { needed: true, type: "mongodb" };
    }
    if (indicators.includes("mysql") || indicators.includes("mariadb")) {
      return { needed: true, type: "mysql" };
    }
    if (
      indicators.includes("postgres") ||
      indicators.includes("pg") ||
      indicators.includes("database_url")
    ) {
      return { needed: true, type: "postgres" };
    }

    return { needed: false, type: "postgres" };
  }

  // ── Detect if the project needs Redis ────────────────────────────────
  private detectRedisNeed(info: ProjectInfo): boolean {
    const indicators = [
      ...info.envVars,
      JSON.stringify(info.files.packageJson || {}),
    ]
      .join(" ")
      .toLowerCase();

    return indicators.includes("redis");
  }

  // ── Build a database service config ──────────────────────────────────
  private buildDatabaseService(
    type: "postgres" | "mysql" | "mongodb",
  ): Record<string, unknown> {
    switch (type) {
      case "postgres":
        return {
          image: "postgres:16-alpine",
          restart: "unless-stopped",
          environment: {
            POSTGRES_DB: "${DB_NAME:-appdb}",
            POSTGRES_USER: "${DB_USER:-appuser}",
            POSTGRES_PASSWORD: "${DB_PASSWORD}",
          },
          volumes: ["db-data:/var/lib/postgresql/data"],
          networks: ["app-network"],
          healthcheck: {
            test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-appuser}"],
            interval: "10s",
            timeout: "5s",
            retries: 5,
          },
        };

      case "mysql":
        return {
          image: "mysql:8",
          restart: "unless-stopped",
          environment: {
            MYSQL_DATABASE: "${DB_NAME:-appdb}",
            MYSQL_USER: "${DB_USER:-appuser}",
            MYSQL_PASSWORD: "${DB_PASSWORD}",
            MYSQL_ROOT_PASSWORD: "${DB_ROOT_PASSWORD}",
          },
          volumes: ["db-data:/var/lib/mysql"],
          networks: ["app-network"],
          healthcheck: {
            test: ["CMD", "mysqladmin", "ping", "-h", "localhost"],
            interval: "10s",
            timeout: "5s",
            retries: 5,
          },
        };

      case "mongodb":
        return {
          image: "mongo:7",
          restart: "unless-stopped",
          environment: {
            MONGO_INITDB_ROOT_USERNAME: "${DB_USER:-appuser}",
            MONGO_INITDB_ROOT_PASSWORD: "${DB_PASSWORD}",
          },
          volumes: ["db-data:/data/db"],
          networks: ["app-network"],
          healthcheck: {
            test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"],
            interval: "10s",
            timeout: "5s",
            retries: 5,
          },
        };
    }
  }
}
