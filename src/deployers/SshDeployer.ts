// ─────────────────────────────────────────────────────────────────────────────
// src/deployers/SshDeployer.ts
// Deploys to a Linux VPS via SSH
// Steps: SCP the image → load it → configure nginx → start service → health check
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "path";
// `ssh2` is an npm package that lets us SSH from Node.js
// It handles the SSH protocol so we don't have to
import { Client as SshClient, ConnectConfig } from "ssh2";
import { SshCredentials } from "../core/SecretManager";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { Logger } from "../utils/Logger";
import { FileUtils } from "../utils/FileUtils";
import { NetworkUtils } from "../utils/NetworkUtils";

export interface DeployResult {
  success: boolean;
  url?: string; // The URL of the deployed app
  error?: string;
}

export class SshDeployer {
  private logger: Logger;
  private fileUtils: FileUtils;
  private networkUtils: NetworkUtils;

  constructor() {
    this.logger = Logger.getInstance();
    this.fileUtils = new FileUtils();
    this.networkUtils = new NetworkUtils();
  }

  // ── Check if Docker is available on the remote server ─────────────────
  // Returns specific diagnostics so the user knows exactly what's wrong
  private async checkDocker(
    creds: SshCredentials,
  ): Promise<{ available: boolean; error?: string }> {
    // Check if the docker command exists
    const whichResult = await this.runRemoteCommand(
      creds,
      "command -v docker >/dev/null 2>&1 && echo found || echo notfound",
    ).catch(() => "notfound");

    if (whichResult.trim() !== "found") {
      return {
        available: false,
        error:
          "Docker is not installed on the remote server. " +
          "Install it with: curl -fsSL https://get.docker.com | sh",
      };
    }

    // Docker binary exists — check if we can talk to the daemon
    const infoResult = await this.runRemoteCommand(
      creds,
      "docker info >/dev/null 2>&1 && echo ok || echo fail",
    ).catch(() => "fail");

    if (infoResult.trim() === "ok") {
      return { available: true };
    }

    // Try with sudo (daemon might be running but user isn't in docker group)
    const sudoInfoResult = await this.runRemoteCommand(
      creds,
      "sudo docker info >/dev/null 2>&1 && echo ok || echo fail",
    ).catch(() => "fail");

    if (sudoInfoResult.trim() === "ok") {
      return {
        available: false,
        error:
          "Docker is installed but the current user doesn't have permission to use it. " +
          "Add your user to the docker group: sudo usermod -aG docker $USER",
      };
    }

    // Docker binary exists but daemon isn't running or accessible
    return {
      available: false,
      error:
        "Docker is installed but the Docker daemon is not running or not accessible. " +
        "Start it with: sudo systemctl start docker",
    };
  }

  // ── Main deploy method ────────────────────────────────────────────────
  public async deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: SshCredentials,
    imageTarPath: string, // Path to the docker image .tar file
    onProgress: (msg: string) => void,
  ): Promise<DeployResult> {
    const appName = config.appName || projectInfo.name || "app";
    const domain = config.domain || `${credentials.host}`;
    const containerPort = config.containerPort || projectInfo.port;

    try {
      // ── 0. Check remote prerequisites ─────────────────────────────
      onProgress("🔍 Checking remote server prerequisites...");
      const dockerCheck = await this.checkDocker(credentials);
      if (!dockerCheck.available) {
        throw new Error(dockerCheck.error);
      }
      onProgress("✅ Docker available on remote server");

      // ── 1. Upload the Docker image ─────────────────────────────────
      onProgress("📤 Uploading Docker image to server...");
      await this.uploadFile(credentials, imageTarPath, `/tmp/${appName}.tar`);
      onProgress("✅ Image uploaded");

      // ── 2. Load the image on the server ───────────────────────────
      onProgress("🐳 Loading Docker image on server...");
      await this.runRemoteCommand(
        credentials,
        `docker load -i /tmp/${appName}.tar && rm /tmp/${appName}.tar`,
      );
      onProgress("✅ Image loaded");

      // ── 3. Configure nginx ─────────────────────────────────────────
      onProgress("🔧 Configuring nginx reverse proxy...");
      const nginxConfig = this.generateNginxConfig(
        appName,
        domain,
        containerPort,
      );

      // Write nginx config to server
      // We pipe the config through SSH
      await this.writeRemoteFile(
        credentials,
        `/etc/nginx/sites-available/${appName}`,
        nginxConfig,
      );

      // Enable the site (create a symlink)
      await this.runRemoteCommand(
        credentials,
        `ln -sf /etc/nginx/sites-available/${appName} /etc/nginx/sites-enabled/${appName} && ` +
          `nginx -t && systemctl reload nginx`, // Test config then reload
      );
      onProgress("✅ nginx configured");

      // ── 4. Set up SSL with Let's Encrypt ──────────────────────────
      if (config.enableSsl && config.domain) {
        onProgress("🔐 Setting up SSL certificate...");
        await this.runRemoteCommand(
          credentials,
          // certbot handles Let's Encrypt automatically
          `certbot --nginx -d ${config.domain} --non-interactive --agree-tos --email admin@${config.domain}`,
        );
        onProgress("✅ SSL certificate installed");
      }

      // ── 5. Create systemd service ──────────────────────────────────
      onProgress("⚙️ Creating systemd service...");
      const serviceConfig = this.generateSystemdService(appName, containerPort);
      await this.writeRemoteFile(
        credentials,
        `/etc/systemd/system/${appName}.service`,
        serviceConfig,
      );

      // Enable and start the service
      await this.runRemoteCommand(
        credentials,
        `systemctl daemon-reload && ` +
          `systemctl enable ${appName} && ` +
          `systemctl restart ${appName}`,
      );
      onProgress("✅ Service started");

      // ── 6. Configure firewall ──────────────────────────────────────
      onProgress("🔒 Configuring firewall...");
      await this.runRemoteCommand(
        credentials,
        // Allow SSH, HTTP, HTTPS. Block everything else.
        `ufw allow 22/tcp && ` +
          `ufw allow 80/tcp && ` +
          `ufw allow 443/tcp && ` +
          `ufw --force enable`,
      );
      onProgress("✅ Firewall configured");

      // ── 7. Wait for health check ───────────────────────────────────
      onProgress("🏥 Waiting for app to become healthy...");
      const protocol = config.enableSsl ? "https" : "http";
      const appUrl = `${protocol}://${domain}`;

      const isHealthy = await this.networkUtils.waitForHealthy(appUrl);

      if (!isHealthy) {
        throw new Error(`App deployed but health check failed at ${appUrl}`);
      }

      onProgress(`✅ App is healthy at ${appUrl}`);

      // ── 8. Save snapshot for rollback ──────────────────────────────
      await this.saveSnapshot(credentials, appName, imageTarPath);

      return { success: true, url: appUrl };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("SSH deployment failed", error);
      return { success: false, error: errorMessage };
    }
  }

  // ── Run a command on the remote server ────────────────────────────────
  // Returns the output of the command
  public runRemoteCommand(
    creds: SshCredentials,
    command: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a new SSH connection
      const conn = new SshClient();

      conn.on("ready", () => {
        // Connection established — now run the command
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          // Collect command output
          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          // Collect error output
          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          // Command finished
          stream.on("close", (code: number) => {
            conn.end();
            if (code === 0) {
              resolve(stdout);
            } else {
              reject(
                new Error(`Command failed (exit ${code}): ${stderr || stdout}`),
              );
            }
          });
        });
      });

      conn.on("error", (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      // Connect to the server using credentials
      conn.connect(this.buildConnectConfig(creds));
    });
  }

  // ── Upload a file to the remote server via SCP ────────────────────────
  private uploadFile(
    creds: SshCredentials,
    localPath: string,
    remotePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new SshClient();

      conn.on("ready", () => {
        // SFTP is the file transfer part of SSH
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          // Upload the file
          // `fastPut` is efficient for large files (like Docker image tars)
          sftp.fastPut(
            localPath,
            remotePath,
            {
              // Report progress for large files
              step: (transferred, _, total) => {
                const pct = Math.round((transferred / total) * 100);
                this.logger.debug(`Upload progress: ${pct}%`);
              },
            },
            (uploadErr) => {
              conn.end();
              if (uploadErr) {
                reject(uploadErr);
              } else {
                resolve();
              }
            },
          );
        });
      });

      conn.on("error", reject);
      conn.connect(this.buildConnectConfig(creds));
    });
  }

  // ── Write text content to a remote file ───────────────────────────────
  private async writeRemoteFile(
    creds: SshCredentials,
    remotePath: string,
    content: string,
  ): Promise<void> {
    // We can't write a file directly, so we echo it through SSH
    // Use base64 encoding to handle special characters safely
    const base64Content = Buffer.from(content).toString("base64");
    await this.runRemoteCommand(
      creds,
      `echo '${base64Content}' | base64 -d > ${remotePath}`,
    );
  }

  // ── Build SSH connection config ───────────────────────────────────────
  private buildConnectConfig(creds: SshCredentials): ConnectConfig {
    const config: ConnectConfig = {
      host: creds.host,
      port: creds.port || 22,
      username: creds.username,
      // Timeout after 30 seconds of no connection
      readyTimeout: 30000,
    };

    // Use password OR private key authentication
    if (creds.password) {
      config.password = creds.password;
    } else if (creds.privateKey) {
      config.privateKey = creds.privateKey;
      if (creds.passphrase) {
        config.passphrase = creds.passphrase;
      }
    }

    return config;
  }

  // ── Generate nginx config for the app ────────────────────────────────
  private generateNginxConfig(
    appName: string,
    domain: string,
    containerPort: number,
  ): string {
    return `# DeployFlow AI Generated nginx config for ${appName}
server {
    listen 80;
    server_name ${domain};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy all requests to our Docker container
    location / {
        proxy_pass http://localhost:${containerPort};
        
        # Pass the real client IP to the app
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # WebSocket support (needed for Next.js, hot reload, etc.)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Serve static files efficiently (if any are in /var/www/${appName})
    location /static/ {
        alias /var/www/${appName}/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;
  }

  // ── Generate systemd service config ───────────────────────────────────
  // systemd is the service manager on Linux — it auto-starts services on boot
  private generateSystemdService(
    appName: string,
    containerPort: number,
  ): string {
    return `[Unit]
Description=DeployFlow AI - ${appName}
# Start after Docker is ready
After=docker.service
Requires=docker.service

[Service]
# Restart automatically if it crashes
Restart=always
RestartSec=10

# Stop any existing container first
ExecStartPre=-/usr/bin/docker stop ${appName}
ExecStartPre=-/usr/bin/docker rm ${appName}

# Start our container
ExecStart=/usr/bin/docker run \\
    --name ${appName} \\
    --restart unless-stopped \\
    -p ${containerPort}:${containerPort} \\
    --memory=512m \\
    --cpus=0.5 \\
    ${appName}:latest

# Stop: gracefully stop Docker container
ExecStop=/usr/bin/docker stop ${appName}

[Install]
WantedBy=multi-user.target
`;
  }

  // ── Save deployment snapshot for rollback ─────────────────────────────
  private async saveSnapshot(
    creds: SshCredentials,
    appName: string,
    imageTarPath: string,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      // Keep only the last 3 snapshots to save disk space
      await this.runRemoteCommand(
        creds,
        `mkdir -p /var/deployflow/snapshots/${appName} && ` +
          // Tag current image with timestamp
          `docker tag ${appName}:latest ${appName}:snapshot-${timestamp} && ` +
          // Remove old snapshots (keep only last 3)
          `docker images ${appName} --format "{{.Tag}}" | grep "snapshot-" | sort -r | tail -n +4 | xargs -r -I{} docker rmi ${appName}:{}`,
      );
    } catch (error) {
      // Snapshot failure is not critical — log and continue
      this.logger.warn("Failed to save deployment snapshot", error);
    }
  }
}
