# Prometheus + Grafana 监控实战

> 企业级可观测性平台搭建指南

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Prometheus Stack                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Prometheus   │  │ Alertmanager │  │ Grafana      │      │
│  │ (采集/存储)   │  │ (告警管理)    │  │ (可视化)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  NodeExporter│    │ cAdvisor    │    │ 应用埋点    │
│  (基础设施)   │    │ (容器指标)   │    │ (Metrics)  │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## 2. Prometheus 核心配置

### 2.1 prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'production'
    environment: 'prod'
  retention: 15d

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  # Prometheus 自身监控
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Kubernetes API Server
  - job_name: 'kubernetes-apiservers'
    kubernetes_sd_configs:
      - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name]
        action: keep
        regex: default;kubernetes

  # Kubernetes Nodes
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_name]
        action: replace
        target_label: instance

  # Kubernetes Pods
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_container_port_number]
        action: keep
        regex: "9[0-9]{3}"  # 保留9xxx端口(metrics)

  # Node Exporter
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # cAdvisor
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  # 应用自定义指标
  - job_name: 'custom-applications'
    static_configs:
      - targets: ['user-service:8080', 'order-service:8080', 'payment-service:8080']
    metrics_path: /metrics
    scrape_interval: 10s
```

### 2.2 告警规则示例

```yaml
groups:
  - name: application-alerts
    rules:
      # 应用可用性告警
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) 
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "High Error Rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"

      # 延迟告警
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Latency on {{ $labels.service }}"
          description: "P95 latency is {{ $value }}s (threshold: 1s)"

      # 内存告警
      - alert: HighMemoryUsage
        expr: |
          (container_memory_working_set_bytes / container_spec_memory_limit_bytes) > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Memory Usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      # Pod重启告警
      - alert: PodRestartingTooMuch
        expr: |
          increase(kube_pod_container_status_restarts_total[1h]) > 3
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} restarting too frequently"

  - name: infrastructure-alerts
    rules:
      # CPU使用率
      - alert: HighCPUUsage
        expr: |
          100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU Usage on {{ $labels.instance }}"
          description: "CPU usage is {{ $value }}%"

      # 磁盘空间
      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.15
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk space is {{ $value | humanizePercentage }}"

      # Pod数量不足
      - alert: TooManyPods
        expr: |
          kubelet_running_pods / kubelet_running_pods_limit > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many pods on {{ $labels.node }}"
```

---

## 3. Grafana Dashboard 配置

### 3.1 Node Exporter Dashboard

```json
{
  "dashboard": {
    "title": "Node Exporter Dashboard",
    "panels": [
      {
        "title": "CPU Usage",
        "type": "timeseries",
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "100 - (avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "{{instance}}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 70},
                {"color": "red", "value": 85}
              ]
            }
          }
        }
      },
      {
        "title": "Memory Usage",
        "type": "timeseries",
        "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))",
            "legendFormat": "{{instance}}"
          }
        ]
      },
      {
        "title": "Disk Usage",
        "type": "gauge",
        "gridPos": { "x": 0, "y": 8, "w": 8, "h": 6 },
        "targets": [
          {
            "expr": "100 - (node_filesystem_avail_bytes{mountpoint=\"/\"} / node_filesystem_size_bytes{mountpoint=\"/\"}) * 100"
          }
        ]
      },
      {
        "title": "Network I/O",
        "type": "timeseries",
        "gridPos": { "x": 8, "y": 8, "w": 16, "h": 6 },
        "targets": [
          {
            "expr": "rate(node_network_receive_bytes_total[5m])",
            "legendFormat": "RX {{instance}}"
          },
          {
            "expr": "rate(node_network_transmit_bytes_total[5m])",
            "legendFormat": "TX {{instance}}"
          }
        ]
      }
    ]
  }
}
```

### 3.2 应用性能 Dashboard

```json
{
  "dashboard": {
    "title": "Application Performance",
    "templating": {
      "list": [
        {
          "name": "service",
          "type": "query",
          "query": "label_values(http_requests_total, service)",
          "multi": true
        }
      ]
    },
    "panels": [
      {
        "title": "Request Rate",
        "type": "timeseries",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{service=~\"$service\"}[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\",service=~\"$service\"}[5m])) / sum(rate(http_requests_total{service=~\"$service\"}[5m])) * 100"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 1},
                {"color": "red", "value": 5}
              ]
            }
          }
        }
      },
      {
        "title": "P99 Latency",
        "type": "timeseries",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service=~\"$service\"}[5m])) by (le, service))",
            "legendFormat": "P99 {{service}}"
          }
        ]
      },
      {
        "title": "Apdex Score",
        "type": "gauge",
        "targets": [
          {
            "expr": "(sum(rate(http_requests_total{service=~\"$service\",status!~\"5..\"}[5m])) + 0.5*sum(rate(http_requests_total{service=~\"$service\",status=~\"5..\"}[5m]))) / sum(rate(http_requests_total{service=~\"$service\"}[5m]))"
          }
        ]
      }
    ]
  }
}
```

---

## 4. Kubernetes 部署

### 4.1 Prometheus Operator

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/metrics
      - services
      - endpoints
      - pods
      - configmaps
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources:
      - configmaps
    verbs: ["get", "update", "create"]
  - nonResourceURLs:
      - /metrics
    verbs: ["get"]
---
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 2
  retention: 15d
  retentionSize: 50GB
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 4Gi
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      team: platform
  podMonitorSelector:
    matchLabels:
      team: platform
  ruleSelector:
    matchLabels:
      role: alert-rules
  alerting:
    alertmanagers:
      - namespace: monitoring
        name: alertmanager-main
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: user-service-monitor
  namespace: monitoring
  labels:
    team: platform
spec:
  selector:
    matchLabels:
      app: user-service
  endpoints:
  - port: metrics
    interval: 15s
    path: /metrics
  namespaceSelector:
    matchNames:
      - production
```

### 4.2 AlertManager 配置

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Alertmanager
metadata:
  name: alertmanager-main
  namespace: monitoring
spec:
  replicas: 3
---
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-config
  namespace: monitoring
stringData:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: 'alerts@example.com'
      smtp_auth_username: 'alerts@example.com'
      smtp_auth_password: 'password'

    templates:
      - '/etc/alertmanager/template/*.tmpl'

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: default
      routes:
        - match:
            severity: critical
          receiver: pagerduty
          continue: true
        - match:
            severity: warning
          receiver: slack
        - match:
            severity: info
          receiver: email

    receivers:
      - name: default
        email_configs:
          - to: 'team@example.com'
            send_resolved: true

      - name: pagerduty
        pagerduty_configs:
          - service_key: 'YOUR_PAGERDUTY_KEY'
            severity: critical
            severity_map:
              critical: critical
              warning: warning
              info: info

      - name: slack
        slack_configs:
          - channel: '#alerts'
            api_url: 'https://hooks.slack.com/services/XXX'
            send_resolved: true
            title: '{{ .GroupLabels.alertname }}'
            text: |
              {{ range .Alerts }}
              *Alert:* {{ .Labels.alertname }}
              *Severity:* {{ .Labels.severity }}
              *Summary:* {{ .Annotations.summary }}
              *Description:* {{ .Annotations.description }}
              {{ end }}
```

---

## 5. 应用埋点示例

### 5.1 Python 应用

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import random
import time

# 定义指标
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

ACTIVE_REQUESTS = Gauge(
    'http_requests_in_flight',
    'Number of active requests'
)

BUSINESSMetric = Counter(
    'business_operations_total',
    'Business operations count',
    ['operation', 'result']
)

# 中间件示例
def metrics_middleware(request, response):
    endpoint = request.path
    method = request.method
    status = response.status_code

    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status).inc()
    REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(response.duration)

if __name__ == '__main__':
    start_http_server(8080)
    print("Metrics server started on :8080")
```

### 5.2 Go 应用

```go
package main

import (
    "net/http"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "endpoint", "status"},
    )

    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration",
            Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
        },
        []string{"method", "endpoint"},
    )

    activeRequests = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "http_requests_in_flight",
            Help: "Number of active requests",
        },
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal, httpRequestDuration, activeRequests)
}

func metricsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        activeRequests.Inc()
        defer activeRequests.Dec()

        // ... handle request ...
        next.ServeHTTP(w, r)
    })
}

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8080", nil)
}
```

---

## 6. 告警通知配置

### 6.1 告警升级规则

| 级别 | 触发条件 | 通知方式 | 升级时间 |
|------|----------|----------|----------|
| P1 | 核心服务不可用 > 5min | 电话 + 短信 | 5min |
| P2 | 错误率 > 5% | 短信 + 钉钉 | 15min |
| P3 | 延迟 > 1s | 钉钉/邮件 | 60min |
| P4 | 资源使用 > 80% | 邮件 | 计划内 |

### 6.2 值班轮换

```yaml
# alertmanager escalation.yaml
route:
  routes:
    - match:
        severity: critical
      receiver: on-call-pager
      group_wait: 30s
      repeat_interval: 4h
      routes:
        - match:
            alertname: ServiceDown
          match:
            duration: 1h
          receiver: escalation-manager

# 值班表集成
on_call_schedule:
  - name: primary
    rotation: weekly
    members:
      - monday@example.com
      - tuesday@example.com
  - name: secondary
    rotation: weekly
    members:
      - saturday@example.com
      - sunday@example.com
```

---

## 7. 常见问题排查

### 7.1 Prometheus 不采集数据

```bash
# 检查targets状态
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health=="down")'

# 检查日志
kubectl logs -n monitoring prometheus-prometheus-0 -f | grep "scrape"

# 检查网络策略
kubectl get networkpolicy -n monitoring
```

### 7.2 AlertManager 不发送告警

```bash
# 检查配置
kubectl exec -n monitoring alertmanager-main-0 -- amtool check-config

# 测试告警
curl -H "Content-Type: application/json" \
  -d '{"labels":{"alertname":"TestAlert"},"annotations":{"summary":"Test"}}' \
  http://localhost:9093/api/v1/alerts
```

---

## 8. 相关资源

- [[SkyWalking APM实战]]
- [[Jaeger 分布式追踪]]
- [[OpenTelemetry 可观测性]]

---

*来源: Prometheus官方文档 & 企业实战*
*最后更新: 2026-05-31*