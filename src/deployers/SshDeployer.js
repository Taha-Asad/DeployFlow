"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/deployers/SshDeployer.ts
// Deploys to a Linux VPS via SSH
// Steps: SCP the image → load it → configure nginx → start service → health check
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshDeployer = void 0;
// `ssh2` is an npm package that lets us SSH from Node.js
// It handles the SSH protocol so we don't have to
const ssh2_1 = require("ssh2");
const Logger_1 = require("../utils/Logger");
const FileUtils_1 = require("../utils/FileUtils");
const NetworkUtils_1 = require("../utils/NetworkUtils");
class SshDeployer {
    logger;
    fileUtils;
    networkUtils;
    constructor() {
        this.logger = Logger_1.Logger.getInstance();
        this.fileUtils = new FileUtils_1.FileUtils();
        this.networkUtils = new NetworkUtils_1.NetworkUtils();
    }
    // ── Check if Docker is available on the remote server ─────────────────
    // Returns specific diagnostics so the user knows exactly what's wrong
    async checkDocker(creds) {
        // Check if the docker command exists.
        // Non-interactive SSH may not load ~/.bashrc / ~/.profile, so we check
        // common install paths directly in addition to PATH lookup.
        let whichResult;
        try {
            whichResult = await this.runRemoteCommand(creds, "{ command -v docker || [ -x /usr/bin/docker ] || [ -x /usr/local/bin/docker ] || [ -x /snap/bin/docker ]; } >/dev/null 2>&1 && echo found || echo notfound");
        }
        catch (sshError) {
            const msg = sshError instanceof Error ? sshError.message : String(sshError);
            return {
                available: false,
                error: `SSH connection failed: ${msg}`,
            };
        }
        if (whichResult.trim() !== "found") {
            return {
                available: false,
                error: "Docker is not installed on the remote server. " +
                    "Install it with: curl -fsSL https://get.docker.com | sh",
            };
        }
        // Docker binary exists — check if we can talk to the daemon
        const infoResult = await this.runRemoteCommand(creds, "docker info >/dev/null 2>&1 && echo ok || echo fail").catch(() => "fail");
        if (infoResult.trim() === "ok") {
            return { available: true };
        }
        // Try with sudo (daemon might be running but user isn't in docker group)
        const sudoInfoResult = await this.runRemoteCommand(creds, "sudo docker info >/dev/null 2>&1 && echo ok || echo fail").catch(() => "fail");
        if (sudoInfoResult.trim() === "ok") {
            return {
                available: false,
                error: "Docker is installed but the current user doesn't have permission to use it. " +
                    "Add your user to the docker group: sudo usermod -aG docker $USER",
            };
        }
        // Docker binary exists but daemon isn't running or accessible
        return {
            available: false,
            error: "Docker is installed but the Docker daemon is not running or not accessible. " +
                "Start it with: sudo systemctl start docker",
        };
    }
    // ── Detect package manager on remote server ─────────────────────────────
    async detectPackageManager(creds) {
        const result = await this.runRemoteCommand(creds, "command -v apt-get >/dev/null && echo apt-get && exit 0; " +
            "command -v dnf >/dev/null && echo dnf && exit 0; " +
            "command -v yum >/dev/null && echo yum && exit 0; " +
            "command -v apk >/dev/null && echo apk && exit 0; " +
            "command -v pacman >/dev/null && echo pacman && exit 0; " +
            "command -v zypper >/dev/null && echo zypper && exit 0; " +
            "echo unknown").catch(() => "unknown");
        return result.trim().split('\n').pop() || null;
    }
    // ── Auto-install Docker on remote server ────────────────────────────────
    async installDocker(creds, pm) {
        const installCommands = {
            'apt-get': 'apt-get update -qq && apt-get install -y -qq docker.io',
            'dnf': 'dnf install -y docker-ce docker-ce-cli containerd.io',
            'yum': 'yum install -y docker-ce docker-ce-cli containerd.io',
            'apk': 'apk add docker && rc-update add docker',
            'pacman': 'pacman -S --noconfirm docker',
            'zypper': 'zypper install -y docker',
        };
        const cmd = installCommands[pm];
        if (!cmd)
            return false;
        try {
            await this.runRemoteCommand(creds, cmd);
            // Start Docker daemon after install
            const startCmd = pm === 'apk'
                ? 'service docker start'
                : 'systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true';
            await this.runRemoteCommand(creds, startCmd);
            return true;
        }
        catch {
            return false;
        }
    }
    // ── Start Docker daemon on remote server ────────────────────────────────
    async startDockerDaemon(creds) {
        const startAttempts = [
            "systemctl start docker 2>&1",
            "service docker start 2>&1",
            "dockerd > /dev/null 2>&1 &",
            "nohup dockerd > /var/log/dockerd.log 2>&1 &",
        ];
        for (const cmd of startAttempts) {
            try {
                await this.runRemoteCommand(creds, cmd);
                // Give the daemon a moment to start
                await new Promise((r) => setTimeout(r, 2000));
                // Check if daemon is now responsive
                const check = await this.runRemoteCommand(creds, "docker info >/dev/null 2>&1 && echo ok || echo fail").catch(() => "fail");
                if (check.trim() === "ok")
                    return true;
            }
            catch {
                continue;
            }
        }
        return false;
    }
    // ── Main deploy method ────────────────────────────────────────────────
    async deploy(projectInfo, config, credentials, imageTarPath, // Path to the docker image .tar file
    onProgress) {
        const appName = config.appName || projectInfo.name || "app";
        const domain = config.domain || `${credentials.host}`;
        const containerPort = config.containerPort || projectInfo.port;
        try {
            // ── 0. Check remote prerequisites ─────────────────────────────
            onProgress("🔍 Checking remote server prerequisites...");
            const dockerCheck = await this.checkDocker(credentials);
            if (!dockerCheck.available) {
                onProgress(`❌ ${dockerCheck.error}`);
                if (dockerCheck.error?.includes("Docker is not installed")) {
                    // ── Auto-install Docker ────────────────────────────
                    onProgress("🔄 Detecting OS to install Docker automatically...");
                    const pm = await this.detectPackageManager(credentials);
                    if (pm) {
                        onProgress(`📦 Installing Docker via ${pm}...`);
                        const installed = await this.installDocker(credentials, pm);
                        if (installed) {
                            onProgress("✅ Docker installed. Re-checking...");
                            const recheck = await this.checkDocker(credentials);
                            if (recheck.available) {
                                onProgress("✅ Docker available on remote server");
                            }
                            else {
                                return { success: false, error: recheck.error };
                            }
                        }
                        else {
                            return { success: false, error: dockerCheck.error };
                        }
                    }
                    else {
                        return { success: false, error: dockerCheck.error };
                    }
                }
                else if (dockerCheck.error?.includes("Docker daemon is not running")) {
                    // ── Auto-start Docker daemon ───────────────────────
                    onProgress("🔄 Attempting to start Docker daemon...");
                    const started = await this.startDockerDaemon(credentials);
                    if (started) {
                        onProgress("✅ Docker daemon started. Re-checking...");
                        const recheck = await this.checkDocker(credentials);
                        if (recheck.available) {
                            onProgress("✅ Docker available on remote server");
                        }
                        else {
                            return { success: false, error: recheck.error };
                        }
                    }
                    else {
                        return { success: false, error: dockerCheck.error };
                    }
                }
                else {
                    return { success: false, error: dockerCheck.error };
                }
            }
            else {
                onProgress("✅ Docker available on remote server");
            }
            // ── 1. Upload the Docker image ─────────────────────────────────
            onProgress("📤 Uploading Docker image to server...");
            await this.uploadFile(credentials, imageTarPath, `/tmp/${appName}.tar`);
            onProgress("✅ Image uploaded");
            // ── 2. Load the image on the server ───────────────────────────
            onProgress("🐳 Loading Docker image on server...");
            await this.runRemoteCommand(credentials, `docker load -i /tmp/${appName}.tar && rm /tmp/${appName}.tar`);
            onProgress("✅ Image loaded");
            // ── 3. Configure nginx ─────────────────────────────────────────
            onProgress("🔧 Configuring nginx reverse proxy...");
            const nginxConfig = this.generateNginxConfig(appName, domain, containerPort);
            // Write nginx config to server
            // We pipe the config through SSH
            await this.writeRemoteFile(credentials, `/etc/nginx/sites-available/${appName}`, nginxConfig);
            // Enable the site (create a symlink)
            await this.runRemoteCommand(credentials, `ln -sf /etc/nginx/sites-available/${appName} /etc/nginx/sites-enabled/${appName} && ` +
                `nginx -t && systemctl reload nginx`);
            onProgress("✅ nginx configured");
            // ── 4. Set up SSL with Let's Encrypt ──────────────────────────
            if (config.enableSsl && config.domain) {
                onProgress("🔐 Setting up SSL certificate...");
                await this.runRemoteCommand(credentials, 
                // certbot handles Let's Encrypt automatically
                `certbot --nginx -d ${config.domain} --non-interactive --agree-tos --email admin@${config.domain}`);
                onProgress("✅ SSL certificate installed");
            }
            // ── 5. Create systemd service ──────────────────────────────────
            onProgress("⚙️ Creating systemd service...");
            const serviceConfig = this.generateSystemdService(appName, containerPort);
            await this.writeRemoteFile(credentials, `/etc/systemd/system/${appName}.service`, serviceConfig);
            // Enable and start the service
            await this.runRemoteCommand(credentials, `systemctl daemon-reload && ` +
                `systemctl enable ${appName} && ` +
                `systemctl restart ${appName}`);
            onProgress("✅ Service started");
            // ── 6. Configure firewall ──────────────────────────────────────
            onProgress("🔒 Configuring firewall...");
            await this.runRemoteCommand(credentials, 
            // Allow SSH, HTTP, HTTPS. Block everything else.
            `ufw allow 22/tcp && ` +
                `ufw allow 80/tcp && ` +
                `ufw allow 443/tcp && ` +
                `ufw --force enable`);
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error("SSH deployment failed", error);
            return { success: false, error: errorMessage };
        }
    }
    // ── Run a command on the remote server ────────────────────────────────
    // Returns the output of the command
    runRemoteCommand(creds, command) {
        return new Promise((resolve, reject) => {
            // Create a new SSH connection
            const conn = new ssh2_1.Client();
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
                    let outputCapped = false;
                    const MAX_SSH_OUTPUT = 1024 * 1024; // 1MB cap
                    stream.on("data", (data) => {
                        if (outputCapped)
                            return;
                        stdout += data.toString();
                        if (stdout.length > MAX_SSH_OUTPUT) {
                            stdout = stdout.slice(0, MAX_SSH_OUTPUT) +
                                `\n[...output truncated at ${MAX_SSH_OUTPUT} bytes]`;
                            outputCapped = true;
                        }
                    });
                    stream.stderr.on("data", (data) => {
                        if (outputCapped && stderr.length > MAX_SSH_OUTPUT)
                            return;
                        stderr += data.toString();
                        if (stderr.length > MAX_SSH_OUTPUT) {
                            stderr = stderr.slice(0, MAX_SSH_OUTPUT) +
                                `\n[...output truncated at ${MAX_SSH_OUTPUT} bytes]`;
                        }
                    });
                    // Command finished
                    let exitCode;
                    stream.on("exit", (code) => {
                        exitCode = code;
                    });
                    stream.on("close", () => {
                        conn.end();
                        if (exitCode === 0 || exitCode === null || exitCode === undefined) {
                            resolve(stdout);
                        }
                        else {
                            reject(new Error(`Command failed (exit ${exitCode}): ${stderr || stdout}`));
                        }
                    });
                });
            });
            const MAX_SSH_OUTPUT = 1024 * 1024; // 1MB cap per remote command
            conn.on("error", (err) => {
                conn.end();
                reject(new Error(`SSH connection failed: ${err.message}`));
            });
            // Connect to the server using credentials
            conn.connect(this.buildConnectConfig(creds));
            // Safety timeout: if command doesn't complete in 5 minutes, force close
            setTimeout(() => {
                conn.end();
                reject(new Error(`SSH command timed out after 5 minutes: ${command.substring(0, 100)}`));
            }, 300000);
        });
    }
    // ── Upload a file to the remote server via SCP ────────────────────────
    uploadFile(creds, localPath, remotePath) {
        return new Promise((resolve, reject) => {
            const conn = new ssh2_1.Client();
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
                    sftp.fastPut(localPath, remotePath, {
                        // Report progress for large files
                        step: (transferred, _, total) => {
                            const pct = Math.round((transferred / total) * 100);
                            this.logger.debug(`Upload progress: ${pct}%`);
                        },
                    }, (uploadErr) => {
                        conn.end();
                        if (uploadErr) {
                            reject(uploadErr);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            });
            conn.on("error", reject);
            conn.connect(this.buildConnectConfig(creds));
        });
    }
    // ── Write text content to a remote file ───────────────────────────────
    async writeRemoteFile(creds, remotePath, content) {
        // We can't write a file directly, so we echo it through SSH
        // Use base64 encoding to handle special characters safely
        const base64Content = Buffer.from(content).toString("base64");
        await this.runRemoteCommand(creds, `echo '${base64Content}' | base64 -d > ${remotePath}`);
    }
    // ── Build SSH connection config ───────────────────────────────────────
    buildConnectConfig(creds) {
        const config = {
            host: creds.host,
            port: creds.port || 22,
            username: creds.username,
            // Timeout after 30 seconds of no connection
            readyTimeout: 30000,
        };
        // Use password OR private key authentication
        if (creds.password) {
            config.password = creds.password;
        }
        else if (creds.privateKey) {
            config.privateKey = creds.privateKey;
            if (creds.passphrase) {
                config.passphrase = creds.passphrase;
            }
        }
        return config;
    }
    // ── Generate nginx config for the app ────────────────────────────────
    generateNginxConfig(appName, domain, containerPort) {
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
    generateSystemdService(appName, containerPort) {
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
    async saveSnapshot(creds, appName, imageTarPath) {
        try {
            const timestamp = Date.now();
            // Keep only the last 3 snapshots to save disk space
            await this.runRemoteCommand(creds, `mkdir -p /var/deployflow/snapshots/${appName} && ` +
                // Tag current image with timestamp
                `docker tag ${appName}:latest ${appName}:snapshot-${timestamp} && ` +
                // Remove old snapshots (keep only last 3)
                `docker images ${appName} --format "{{.Tag}}" | grep "snapshot-" | sort -r | tail -n +4 | xargs -r -I{} docker rmi ${appName}:{}`);
        }
        catch (error) {
            // Snapshot failure is not critical — log and continue
            this.logger.warn("Failed to save deployment snapshot", error);
        }
    }
}
exports.SshDeployer = SshDeployer;
//# sourceMappingURL=SshDeployer.js.map