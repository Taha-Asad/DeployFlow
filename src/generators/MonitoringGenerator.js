"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/generators/MonitoringGenerator.ts
// Generates Prometheus + Grafana monitoring configurations
// Prometheus = collects metrics | Grafana = visualizes them as dashboards
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
exports.MonitoringGenerator = void 0;
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class MonitoringGenerator {
    fileUtils;
    logger;
    constructor() {
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Generate all monitoring configs ───────────────────────────────────
    async generate(projectInfo) {
        this.logger.info("Generating monitoring configs...");
        const monitoringDir = path.join(projectInfo.rootPath, "monitoring");
        await this.generatePrometheusConfig(monitoringDir, projectInfo);
        await this.generateGrafanaDashboard(monitoringDir, projectInfo);
        await this.generateAlertRules(monitoringDir, projectInfo);
        await this.generateMonitoringCompose(monitoringDir, projectInfo);
        this.logger.info("✅ Monitoring configs generated in monitoring/");
    }
    // ── Prometheus Configuration ──────────────────────────────────────────
    async generatePrometheusConfig(monitoringDir, info) {
        const config = {
            global: {
                // How often Prometheus collects metrics
                scrape_interval: "15s",
                // How often to evaluate alert rules
                evaluation_interval: "15s",
                external_labels: {
                    app: info.name,
                    environment: "production",
                },
            },
            // Alert manager for sending notifications
            alerting: {
                alertmanagers: [
                    {
                        static_configs: [{ targets: ["alertmanager:9093"] }],
                    },
                ],
            },
            // Load alert rules from files
            rule_files: ["alert-rules.yml"],
            // What to collect metrics from
            scrape_configs: [
                // ── Prometheus itself ────────────────────────────────────
                {
                    job_name: "prometheus",
                    static_configs: [{ targets: ["localhost:9090"] }],
                },
                // ── Our application ──────────────────────────────────────
                // Your app must expose a /metrics endpoint in Prometheus format
                // For Node.js: use 'prom-client' library
                // For Python: use 'prometheus_client' library
                {
                    job_name: info.name,
                    scrape_interval: "5s",
                    static_configs: [
                        {
                            targets: [`${info.name}:${info.port}`],
                            labels: { app: info.name },
                        },
                    ],
                    metrics_path: "/metrics",
                },
                // ── nginx metrics ────────────────────────────────────────
                {
                    job_name: "nginx",
                    static_configs: [{ targets: ["nginx-exporter:9113"] }],
                },
                // ── Node.js system metrics (if applicable) ───────────────
                ...(info.language === "javascript" || info.language === "typescript"
                    ? [
                        {
                            job_name: "node-exporter",
                            static_configs: [{ targets: ["node-exporter:9100"] }],
                        },
                    ]
                    : []),
            ],
        };
        const yamlContent = `# DeployFlow AI Generated Prometheus Config\n` +
            `# prometheus.yml\n\n` +
            yaml.dump(config, { indent: 2 });
        await this.fileUtils.writeFile(path.join(monitoringDir, "prometheus.yml"), yamlContent);
    }
    // ── Alert Rules ───────────────────────────────────────────────────────
    async generateAlertRules(monitoringDir, info) {
        const rules = {
            groups: [
                {
                    name: `${info.name}-alerts`,
                    rules: [
                        // Alert when app is down
                        {
                            alert: "AppDown",
                            // `up == 0` means Prometheus can't reach the app
                            expr: `up{job="${info.name}"} == 0`,
                            // Fire immediately (0 minutes)
                            for: "0m",
                            labels: { severity: "critical" },
                            annotations: {
                                summary: `${info.name} is DOWN`,
                                description: "The application has been unreachable for 0 minutes.",
                            },
                        },
                        // Alert on high CPU
                        {
                            alert: "HighCpuUsage",
                            expr: `process_cpu_seconds_total{job="${info.name}"} > 0.8`,
                            for: "5m",
                            labels: { severity: "warning" },
                            annotations: {
                                summary: "High CPU usage detected",
                                description: "CPU usage has been above 80% for 5 minutes.",
                            },
                        },
                        // Alert on high memory
                        {
                            alert: "HighMemoryUsage",
                            expr: `process_resident_memory_bytes{job="${info.name}"} > 450000000`, // 450MB
                            for: "5m",
                            labels: { severity: "warning" },
                            annotations: {
                                summary: "High memory usage",
                                description: "Memory usage is above 450MB.",
                            },
                        },
                        // Alert on high error rate
                        {
                            alert: "HighErrorRate",
                            // More than 5% of requests are errors
                            expr: `rate(http_requests_total{job="${info.name}",status=~"5.."}[5m]) / rate(http_requests_total{job="${info.name}"}[5m]) > 0.05`,
                            for: "2m",
                            labels: { severity: "critical" },
                            annotations: {
                                summary: "High HTTP error rate",
                                description: "More than 5% of requests are returning 5xx errors.",
                            },
                        },
                        // Alert on slow response times
                        {
                            alert: "SlowResponseTime",
                            // 95th percentile response time > 2 seconds
                            expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${info.name}"}[5m])) > 2`,
                            for: "5m",
                            labels: { severity: "warning" },
                            annotations: {
                                summary: "Slow API responses",
                                description: "P95 response time is above 2 seconds.",
                            },
                        },
                    ],
                },
            ],
        };
        const yamlContent = `# DeployFlow AI Generated Alert Rules\n\n` +
            yaml.dump(rules, { indent: 2 });
        await this.fileUtils.writeFile(path.join(monitoringDir, "alert-rules.yml"), yamlContent);
    }
    // ── Grafana Dashboard JSON ─────────────────────────────────────────────
    async generateGrafanaDashboard(monitoringDir, info) {
        // Grafana dashboards are defined as JSON
        // This is a basic dashboard with the most important metrics
        const dashboard = {
            title: `${info.name} - Production Dashboard`,
            uid: `${info.name}-prod`,
            version: 1,
            refresh: "30s",
            schemaVersion: 38,
            tags: [info.name, "production", "deployflow"],
            time: { from: "now-1h", to: "now" },
            panels: [
                // ── Request Rate ───────────────────────────────────────
                {
                    id: 1,
                    title: "Request Rate (req/s)",
                    type: "graph",
                    gridPos: { h: 8, w: 12, x: 0, y: 0 },
                    targets: [
                        {
                            expr: `rate(http_requests_total{job="${info.name}"}[1m])`,
                            legendFormat: "Requests/sec",
                        },
                    ],
                },
                // ── Error Rate ────────────────────────────────────────
                {
                    id: 2,
                    title: "Error Rate (%)",
                    type: "graph",
                    gridPos: { h: 8, w: 12, x: 12, y: 0 },
                    targets: [
                        {
                            expr: `rate(http_requests_total{job="${info.name}",status=~"5.."}[1m]) / rate(http_requests_total{job="${info.name}"}[1m]) * 100`,
                            legendFormat: "Error %",
                        },
                    ],
                },
                // ── Response Time ─────────────────────────────────────
                {
                    id: 3,
                    title: "Response Time Percentiles",
                    type: "graph",
                    gridPos: { h: 8, w: 12, x: 0, y: 8 },
                    targets: [
                        {
                            expr: `histogram_quantile(0.50, rate(http_request_duration_seconds_bucket{job="${info.name}"}[5m]))`,
                            legendFormat: "P50",
                        },
                        {
                            expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${info.name}"}[5m]))`,
                            legendFormat: "P95",
                        },
                        {
                            expr: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{job="${info.name}"}[5m]))`,
                            legendFormat: "P99",
                        },
                    ],
                },
                // ── Memory Usage ──────────────────────────────────────
                {
                    id: 4,
                    title: "Memory Usage (MB)",
                    type: "graph",
                    gridPos: { h: 8, w: 12, x: 12, y: 8 },
                    targets: [
                        {
                            expr: `process_resident_memory_bytes{job="${info.name}"} / 1024 / 1024`,
                            legendFormat: "Memory MB",
                        },
                    ],
                },
                // ── Uptime Stat ───────────────────────────────────────
                {
                    id: 5,
                    title: "Uptime",
                    type: "stat",
                    gridPos: { h: 4, w: 4, x: 0, y: 16 },
                    targets: [
                        {
                            expr: `up{job="${info.name}"}`,
                            legendFormat: "Up",
                        },
                    ],
                    options: {
                        reduceOptions: { calcs: ["lastNotNull"] },
                        colorMode: "background",
                        mappings: [
                            {
                                type: "value",
                                options: { "0": { text: "DOWN", color: "red" } },
                            },
                            {
                                type: "value",
                                options: { "1": { text: "UP", color: "green" } },
                            },
                        ],
                    },
                },
            ],
        };
        await this.fileUtils.writeFile(path.join(monitoringDir, "grafana-dashboard.json"), JSON.stringify(dashboard, null, 2));
        // Also generate Grafana provisioning config
        const grafanaDir = path.join(monitoringDir, "grafana", "provisioning");
        await this.fileUtils.writeFile(path.join(grafanaDir, "datasources", "prometheus.yml"), yaml.dump({
            apiVersion: 1,
            datasources: [
                {
                    name: "Prometheus",
                    type: "prometheus",
                    url: "http://prometheus:9090",
                    isDefault: true,
                    access: "proxy",
                },
            ],
        }));
        await this.fileUtils.writeFile(path.join(grafanaDir, "dashboards", "dashboard.yml"), yaml.dump({
            apiVersion: 1,
            providers: [
                {
                    name: "default",
                    folder: info.name,
                    type: "file",
                    options: { path: "/var/lib/grafana/dashboards" },
                },
            ],
        }));
    }
    // ── Monitoring docker-compose ─────────────────────────────────────────
    async generateMonitoringCompose(monitoringDir, info) {
        const compose = {
            version: "3.8",
            services: {
                prometheus: {
                    image: "prom/prometheus:latest",
                    restart: "unless-stopped",
                    ports: ["9090:9090"],
                    volumes: [
                        "./prometheus.yml:/etc/prometheus/prometheus.yml:ro",
                        "./alert-rules.yml:/etc/prometheus/alert-rules.yml:ro",
                        "prometheus-data:/prometheus",
                    ],
                    command: [
                        "--config.file=/etc/prometheus/prometheus.yml",
                        "--storage.tsdb.path=/prometheus",
                        "--storage.tsdb.retention.time=30d",
                        "--web.enable-lifecycle",
                    ],
                    networks: ["monitoring"],
                },
                grafana: {
                    image: "grafana/grafana:latest",
                    restart: "unless-stopped",
                    ports: ["3000:3000"],
                    environment: {
                        GF_SECURITY_ADMIN_PASSWORD: "${GRAFANA_PASSWORD:-admin123}",
                        GF_USERS_ALLOW_SIGN_UP: "false",
                    },
                    volumes: [
                        "grafana-data:/var/lib/grafana",
                        "./grafana/provisioning:/etc/grafana/provisioning:ro",
                        "./grafana-dashboard.json:/var/lib/grafana/dashboards/dashboard.json:ro",
                    ],
                    depends_on: ["prometheus"],
                    networks: ["monitoring"],
                },
                alertmanager: {
                    image: "prom/alertmanager:latest",
                    restart: "unless-stopped",
                    ports: ["9093:9093"],
                    networks: ["monitoring"],
                },
                "node-exporter": {
                    image: "prom/node-exporter:latest",
                    restart: "unless-stopped",
                    pid: "host",
                    volumes: ["/proc:/host/proc:ro", "/sys:/host/sys:ro", "/:/rootfs:ro"],
                    command: [
                        "--path.procfs=/host/proc",
                        "--path.sysfs=/host/sys",
                        "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)",
                    ],
                    networks: ["monitoring"],
                },
                "nginx-exporter": {
                    image: "nginx/nginx-prometheus-exporter:latest",
                    restart: "unless-stopped",
                    command: ["-nginx.scrape-uri=http://nginx:80/stub_status"],
                    networks: ["monitoring"],
                },
            },
            volumes: {
                "prometheus-data": {},
                "grafana-data": {},
            },
            networks: {
                monitoring: { driver: "bridge" },
            },
        };
        const yamlContent = `# DeployFlow AI Generated Monitoring Stack\n` +
            `# Start with: docker-compose -f docker-compose.monitoring.yml up -d\n\n` +
            yaml.dump(compose, { indent: 2 });
        await this.fileUtils.writeFile(path.join(monitoringDir, "docker-compose.monitoring.yml"), yamlContent);
    }
}
exports.MonitoringGenerator = MonitoringGenerator;
//# sourceMappingURL=MonitoringGenerator.js.map