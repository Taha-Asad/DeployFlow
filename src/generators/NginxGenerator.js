"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/generators/NginxGenerator.ts
// Generates nginx configuration for reverse proxy and static file serving
// nginx sits in front of your app and handles SSL, compression, caching
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
exports.NginxGenerator = void 0;
const path = __importStar(require("path"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class NginxGenerator {
    fileUtils;
    logger;
    constructor() {
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Generate nginx.conf ───────────────────────────────────────────────
    async generate(projectInfo, deployConfig) {
        this.logger.info("Generating nginx.conf...");
        const config = projectInfo.type === "frontend"
            ? this.generateFrontendConfig(projectInfo, deployConfig)
            : this.generateProxyConfig(projectInfo, deployConfig);
        await this.fileUtils.writeFile(path.join(projectInfo.rootPath, "nginx.conf"), config);
        this.logger.info("✅ nginx.conf generated");
    }
    // ── nginx config for frontend (serves static files) ───────────────────
    generateFrontendConfig(info, config) {
        const domain = config.domain || "localhost";
        return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated nginx.conf
# Type: Frontend (Static Files)
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

# Number of worker processes (auto = one per CPU core)
worker_processes auto;

# Max open files per worker
worker_rlimit_nofile 65535;

events {
    # Max connections per worker
    worker_connections 1024;
    # Accept multiple connections at once
    multi_accept on;
}

http {
    # ── Basics ────────────────────────────────────────────────────
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # ── Logging ───────────────────────────────────────────────────
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    # ── Performance ───────────────────────────────────────────────
    # sendfile = use OS-level file sending (faster)
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    # Keep connections alive for 65 seconds
    keepalive_timeout 65;

    # ── Compression ───────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        image/svg+xml;

    # ── Security ──────────────────────────────────────────────────
    # Hide nginx version (security through obscurity)
    server_tokens off;

    # ── Main Server Block ─────────────────────────────────────────
    server {
        listen 80;
        listen [::]:80; # IPv6

        server_name ${domain};

        # Document root — where our built files live
        root /usr/share/nginx/html;
        index index.html;

        # ── Security Headers ──────────────────────────────────────
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

        # ── SPA Routing ───────────────────────────────────────────
        # For React/Vue/Angular: any route that doesn't match a file
        # should serve index.html (let the JS router handle it)
        location / {
            try_files $uri $uri/ /index.html;
        }

        # ── Static Asset Caching ──────────────────────────────────
        # Assets with hashes in filename can be cached forever
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            # Remove Last-Modified header (the hash is enough)
            add_header Last-Modified "";
        }

        # ── Health Check Endpoint ─────────────────────────────────
        location /health {
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }

        # ── Error Pages ───────────────────────────────────────────
        error_page 404 /index.html; # Let SPA handle 404s
        error_page 500 502 503 504 /50x.html;

        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
`;
    }
    // ── nginx config for backend (reverse proxy to Node/Python/etc.) ──────
    generateProxyConfig(info, config) {
        const domain = config.domain || "localhost";
        const upstreamPort = info.port;
        return `# ═══════════════════════════════════════════════════════════
# DeployFlow AI Generated nginx.conf
# Type: Reverse Proxy (Backend App)
# Generated: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 2048;
    multi_accept on;
    use epoll; # Linux-specific, most efficient event model
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" rt=$request_time';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    server_tokens off;

    # ── Rate Limiting ─────────────────────────────────────────────
    # Prevent abuse / DDoS
    # 10 requests per second per IP
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # ── Gzip ─────────────────────────────────────────────────────
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    # ── Upstream Definition ───────────────────────────────────────
    # "upstream" = the backend server(s) nginx proxies to
    # We can add multiple servers here for load balancing
    upstream ${info.name}_backend {
        # Our app container
        server localhost:${upstreamPort};

        # Connection pooling — reuse connections for performance
        keepalive 32;
    }

    server {
        listen 80;
        listen [::]:80;
        server_name ${domain};

        # ── Security Headers ──────────────────────────────────────
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # ── Client Upload Limit ───────────────────────────────────
        client_max_body_size 10M;

        # ── API Routes ────────────────────────────────────────────
        location / {
            # Apply rate limiting (burst=20 means allow 20 extra requests)
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://${info.name}_backend;

            # Pass real client information to the backend
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout    60s;
            proxy_read_timeout    60s;

            # Buffering — stores response before sending to client
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;

            # WebSocket support (needed for Socket.io, Next.js HMR, etc.)
            proxy_http_version 1.1;
            proxy_set_header Upgrade    $http_upgrade;
            proxy_set_header Connection "upgrade";

            # Connection pooling with upstream
            proxy_set_header Connection "";
        }

        # ── Health Check (bypass rate limiting) ───────────────────
        location /health {
            proxy_pass http://${info.name}_backend/health;
            access_log off; # Don't log health checks
        }

        # ── Static Files (if app serves them) ────────────────────
        location /static/ {
            alias /var/www/${info.name}/static/;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        error_page 500 502 503 504 /50x.html;
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
`;
    }
}
exports.NginxGenerator = NginxGenerator;
//# sourceMappingURL=NginxGenerator.js.map