"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/generators/KubernetesGenerator.ts
// Generates Kubernetes manifests (Deployment, Service, Ingress, HPA)
// Kubernetes = container orchestration for large-scale deployments
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
exports.KubernetesGenerator = void 0;
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class KubernetesGenerator {
    fileUtils;
    logger;
    constructor() {
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Generate all K8s manifests ────────────────────────────────────────
    async generate(projectInfo, deployConfig) {
        this.logger.info("Generating Kubernetes manifests...");
        const k8sDir = path.join(projectInfo.rootPath, "k8s");
        const appName = deployConfig.appName || projectInfo.name;
        const namespace = "production";
        // Generate each manifest file
        await this.generateNamespace(k8sDir, namespace);
        await this.generateDeployment(k8sDir, projectInfo, deployConfig);
        await this.generateService(k8sDir, appName, projectInfo.port, namespace);
        await this.generateIngress(k8sDir, appName, deployConfig, namespace);
        await this.generateHpa(k8sDir, appName, namespace);
        await this.generateConfigMap(k8sDir, appName, projectInfo, namespace);
        await this.generateSecretTemplate(k8sDir, appName, projectInfo, namespace);
        await this.generateKustomization(k8sDir, appName);
        this.logger.info("✅ Kubernetes manifests generated in k8s/");
    }
    // ── Namespace ─────────────────────────────────────────────────────────
    async generateNamespace(k8sDir, namespace) {
        const manifest = {
            apiVersion: "v1",
            kind: "Namespace",
            metadata: {
                name: namespace,
                labels: {
                    "managed-by": "deployflow-ai",
                },
            },
        };
        await this.writeManifest(k8sDir, "namespace.yaml", manifest);
    }
    // ── Deployment ────────────────────────────────────────────────────────
    // A Deployment ensures N replicas of your app are always running
    async generateDeployment(k8sDir, info, config) {
        const appName = config.appName || info.name;
        const namespace = "production";
        const manifest = {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
                name: appName,
                namespace,
                labels: {
                    app: appName,
                    version: info.version || "1.0.0",
                    "managed-by": "deployflow-ai",
                },
            },
            spec: {
                // Start with 2 replicas for high availability
                replicas: 2,
                // Which pods this deployment manages
                selector: {
                    matchLabels: { app: appName },
                },
                // Rolling update strategy — update pods one at a time (zero downtime)
                strategy: {
                    type: "RollingUpdate",
                    rollingUpdate: {
                        maxSurge: 1, // Create 1 extra pod during update
                        maxUnavailable: 0, // Never have fewer than desired pods
                    },
                },
                template: {
                    metadata: {
                        labels: { app: appName },
                        annotations: {
                            // Prometheus will scrape metrics from this port
                            "prometheus.io/scrape": "true",
                            "prometheus.io/port": String(info.port),
                        },
                    },
                    spec: {
                        // Run containers as non-root for security
                        securityContext: {
                            runAsNonRoot: true,
                            runAsUser: 1001,
                            fsGroup: 1001,
                        },
                        containers: [
                            {
                                name: appName,
                                // In production, use a specific version tag, not 'latest'
                                image: `${appName}:latest`,
                                // 'Always' = always pull the latest image (for CD)
                                imagePullPolicy: "Always",
                                ports: [
                                    {
                                        containerPort: info.port,
                                        name: "http",
                                    },
                                ],
                                // Environment variables from ConfigMap and Secrets
                                envFrom: [
                                    { configMapRef: { name: `${appName}-config` } },
                                    { secretRef: { name: `${appName}-secrets` } },
                                ],
                                // Resource requests and limits
                                resources: {
                                    requests: {
                                        memory: "128Mi",
                                        cpu: "100m", // 100 millicores = 0.1 CPU
                                    },
                                    limits: {
                                        memory: "512Mi",
                                        cpu: "500m", // 500 millicores = 0.5 CPU
                                    },
                                },
                                // Liveness probe — restart container if this fails
                                livenessProbe: {
                                    httpGet: {
                                        path: "/health",
                                        port: info.port,
                                    },
                                    initialDelaySeconds: 30,
                                    periodSeconds: 10,
                                    failureThreshold: 3,
                                },
                                // Readiness probe — remove from load balancer if this fails
                                readinessProbe: {
                                    httpGet: {
                                        path: "/health",
                                        port: info.port,
                                    },
                                    initialDelaySeconds: 5,
                                    periodSeconds: 5,
                                    failureThreshold: 3,
                                },
                                // Container security settings
                                securityContext: {
                                    allowPrivilegeEscalation: false,
                                    readOnlyRootFilesystem: true,
                                    capabilities: {
                                        drop: ["ALL"],
                                    },
                                },
                                // Writable temp directory (since root filesystem is read-only)
                                volumeMounts: [
                                    {
                                        name: "tmp",
                                        mountPath: "/tmp",
                                    },
                                ],
                            },
                        ],
                        volumes: [
                            {
                                name: "tmp",
                                emptyDir: {}, // Empty directory, deleted when pod is removed
                            },
                        ],
                        // Ensure pods don't all end up on the same node
                        affinity: {
                            podAntiAffinity: {
                                preferredDuringSchedulingIgnoredDuringExecution: [
                                    {
                                        weight: 100,
                                        podAffinityTerm: {
                                            labelSelector: {
                                                matchLabels: { app: appName },
                                            },
                                            topologyKey: "kubernetes.io/hostname",
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        };
        await this.writeManifest(k8sDir, "deployment.yaml", manifest);
    }
    // ── Service ───────────────────────────────────────────────────────────
    // A Service exposes pods as a stable network endpoint
    async generateService(k8sDir, appName, port, namespace) {
        const manifest = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                name: appName,
                namespace,
                labels: { app: appName },
            },
            spec: {
                selector: { app: appName },
                ports: [
                    {
                        name: "http",
                        port: 80,
                        targetPort: port,
                        protocol: "TCP",
                    },
                ],
                type: "ClusterIP", // Only accessible within the cluster (Ingress handles external)
            },
        };
        await this.writeManifest(k8sDir, "service.yaml", manifest);
    }
    // ── Ingress ───────────────────────────────────────────────────────────
    // Ingress = the entry point for external HTTP traffic
    async generateIngress(k8sDir, appName, config, namespace) {
        const domain = config.domain || `${appName}.example.com`;
        const manifest = {
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: {
                name: appName,
                namespace,
                annotations: {
                    // nginx ingress controller
                    "kubernetes.io/ingress.class": "nginx",
                    // Let cert-manager handle SSL automatically
                    "cert-manager.io/cluster-issuer": "letsencrypt-prod",
                    // Redirect HTTP to HTTPS
                    "nginx.ingress.kubernetes.io/ssl-redirect": "true",
                    // Rate limiting
                    "nginx.ingress.kubernetes.io/limit-rps": "100",
                },
            },
            spec: {
                // SSL certificate configuration
                tls: [
                    {
                        hosts: [domain],
                        secretName: `${appName}-tls`,
                    },
                ],
                rules: [
                    {
                        host: domain,
                        http: {
                            paths: [
                                {
                                    path: "/",
                                    pathType: "Prefix",
                                    backend: {
                                        service: {
                                            name: appName,
                                            port: { number: 80 },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        };
        await this.writeManifest(k8sDir, "ingress.yaml", manifest);
    }
    // ── HorizontalPodAutoscaler ───────────────────────────────────────────
    // HPA automatically scales pod count based on CPU/memory usage
    async generateHpa(k8sDir, appName, namespace) {
        const manifest = {
            apiVersion: "autoscaling/v2",
            kind: "HorizontalPodAutoscaler",
            metadata: {
                name: appName,
                namespace,
            },
            spec: {
                scaleTargetRef: {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    name: appName,
                },
                minReplicas: 2, // Always have at least 2 (high availability)
                maxReplicas: 10, // Scale up to 10 under heavy load
                metrics: [
                    {
                        type: "Resource",
                        resource: {
                            name: "cpu",
                            target: {
                                type: "Utilization",
                                averageUtilization: 70, // Scale when CPU > 70%
                            },
                        },
                    },
                    {
                        type: "Resource",
                        resource: {
                            name: "memory",
                            target: {
                                type: "Utilization",
                                averageUtilization: 80, // Scale when memory > 80%
                            },
                        },
                    },
                ],
                behavior: {
                    scaleDown: {
                        // Wait 5 minutes before scaling down (prevents flapping)
                        stabilizationWindowSeconds: 300,
                    },
                },
            },
        };
        await this.writeManifest(k8sDir, "hpa.yaml", manifest);
    }
    // ── ConfigMap ─────────────────────────────────────────────────────────
    // Non-secret configuration
    async generateConfigMap(k8sDir, appName, info, namespace) {
        const manifest = {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
                name: `${appName}-config`,
                namespace,
            },
            data: {
                NODE_ENV: "production",
                PORT: String(info.port),
                LOG_LEVEL: "info",
                // Add non-secret env vars here
                ...Object.fromEntries(info.envVars
                    .filter((v) => !v.includes("SECRET") &&
                    !v.includes("KEY") &&
                    !v.includes("PASSWORD") &&
                    !v.includes("TOKEN"))
                    .map((v) => [v, `REPLACE_WITH_${v}`])),
            },
        };
        await this.writeManifest(k8sDir, "configmap.yaml", manifest);
    }
    // ── Secret Template ───────────────────────────────────────────────────
    // Template for secrets (values are placeholders — fill in for real use)
    async generateSecretTemplate(k8sDir, appName, info, namespace) {
        const secretVars = info.envVars.filter((v) => v.includes("SECRET") ||
            v.includes("KEY") ||
            v.includes("PASSWORD") ||
            v.includes("TOKEN") ||
            v.includes("DATABASE_URL"));
        const manifest = {
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
                name: `${appName}-secrets`,
                namespace,
                annotations: {
                    "deployflow/note": "Replace base64-encoded values with your actual secrets",
                },
            },
            type: "Opaque",
            // Values MUST be base64 encoded
            // Run: echo -n "myvalue" | base64
            data: Object.fromEntries(secretVars.map((v) => [
                v,
                Buffer.from(`REPLACE_WITH_${v}`).toString("base64"),
            ])),
        };
        await this.writeManifest(k8sDir, "secrets.yaml.template", manifest);
        // Add a note file
        await this.fileUtils.writeFile(path.join(k8sDir, "SECRETS_README.md"), `# Kubernetes Secrets\n\n` +
            `The file \`secrets.yaml.template\` contains placeholders.\n\n` +
            `To set real values:\n\n` +
            `\`\`\`bash\n` +
            secretVars
                .map((v) => `kubectl create secret generic ${appName}-secrets \\\n` +
                `  --from-literal=${v}=YOUR_VALUE \\\n` +
                `  -n production`)
                .join("\n\n") +
            `\n\`\`\`\n`);
    }
    // ── Kustomization ─────────────────────────────────────────────────────
    // Kustomize lets you customize manifests for different environments
    async generateKustomization(k8sDir, appName) {
        const manifest = {
            apiVersion: "kustomize.config.k8s.io/v1beta1",
            kind: "Kustomization",
            resources: [
                "namespace.yaml",
                "deployment.yaml",
                "service.yaml",
                "ingress.yaml",
                "hpa.yaml",
                "configmap.yaml",
            ],
            commonLabels: {
                "managed-by": "deployflow-ai",
                app: appName,
            },
        };
        await this.writeManifest(k8sDir, "kustomization.yaml", manifest);
    }
    // ── Write a manifest file as YAML ─────────────────────────────────────
    async writeManifest(dir, filename, manifest) {
        const content = `# DeployFlow AI Generated — ${filename}\n` +
            `# Generated: ${new Date().toISOString()}\n\n` +
            yaml.dump(manifest, { indent: 2, lineWidth: 120 });
        await this.fileUtils.writeFile(path.join(dir, filename), content);
    }
}
exports.KubernetesGenerator = KubernetesGenerator;
//# sourceMappingURL=KubernetesGenerator.js.map