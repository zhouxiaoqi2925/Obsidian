# Kubernetes 实战案例

> 企业级容器编排最佳实践

---

## 1. 核心概念

### 1.1 架构组成

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
│  │API Server│ │Scheduler│ │Controller│ │ etcd        │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                      Data Plane                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │ Node 1  │  │ Node 2  │  │ Node 3  │                  │
│  │ kubelet │  │ kubelet │  │ kubelet │                  │
│  │ kube-proxy│ │kube-proxy│ │kube-proxy│                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 核心资源对象

| 资源 | 用途 | 关键字段 |
|------|------|----------|
| Pod | 最小调度单元 | containers, resources, ports |
| Deployment | 无状态应用管理 | replicas, selector, strategy |
| StatefulSet | 有状态应用管理 | serviceName, volumeClaimTemplates |
| DaemonSet | 节点级别守护 | nodeSelector, tolerations |
| Service | 负载均衡 | selector, ports, type |
| Ingress | HTTP路由 | rules, backend, tls |

---

## 2. 企业级部署实战

### 2.1 高可用Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: production
  labels:
    app: user-service
    version: v2
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
        version: v2
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: user-service
        image: myregistry/user-service:v2.1.0
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9090
          name: grpc
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 3
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
          failureThreshold: 5
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 10"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection-string
        - name: REDIS_HOST
          value: "redis.prod.svc.cluster.local"
```

### 2.2 Service配置

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: production
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
spec:
  type: LoadBalancer
  selector:
    app: user-service
  ports:
  - name: http
    port: 80
    targetPort: 8080
  - name: grpc
    port: 443
    targetPort: 9090
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
```

### 2.3 Ingress配置

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: user-service-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "30"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.example.com
    secretName: api-tls-secret
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /users
        pathType: Prefix
        backend:
          service:
            name: user-service
            port:
              number: 80
      - path: /orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
```

---

## 3. 存储与持久化

### 3.1 StatefulSet + PVC

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql-primary
  namespace: database
spec:
  serviceName: mysql-headless
  replicas: 3
  podManagementPolicy: Parallel
  updateStrategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      initContainers:
      - name: init-mysql
        image: mysql:8.0
        command:
        - bash
        - "-c"
        - |
          set -ex
          [[ $HOSTNAME =~ -(0|1|2)$ ]] || exit 1
          [[ $(hostname) =~ -([0-9]+)$ ]] && ORDINAL=${BASH_REMATCH[1]}
          echo "Datadir: /var/lib/mysql/$HOSTNAME" > /var/lib/mysql-configmap/hostname.conf
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - containerPort: 3306
          name: mysql
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
        - name: config
          mountPath: /etc/mysql/conf.d
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: root-password
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: "ssd-storage"
      resources:
        requests:
          storage: 100Gi
```

### 3.2 ConfigMap热更新

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  config.yaml: |
    server:
      port: 8080
      readTimeout: 30s
      writeTimeout: 30s
    cache:
      ttl: 3600
      maxSize: 10000
    database:
      maxConnections: 100
      idleTimeout: 10m
---
# 触发配置热更新
kubectl rollout restart deployment/user-service -n production
```

---

## 4. 自动扩缩容

### 4.1 HPA配置

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
  maxReplicas: 100
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
```

### 4.2 VPA垂直扩缩容

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: user-service-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  updatePolicy:
    updateMode: "Auto"
    containerPolicy:
    - containerName: user-service
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 4
        memory: 16Gi
      controlledResources: ["cpu", "memory"]
```

---

## 5. 网络策略

### 5.1 零信任网络

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: user-service-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: user-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: mysql
    ports:
    - protocol: TCP
      port: 3306
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53  # DNS
```

---

## 6. 资源配额与限制

### 6.1 ResourceQuota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "40"
    requests.memory: 80Gi
    limits.cpu: "80"
    limits.memory: 160Gi
    pods: "100"
    services: "20"
    persistentvolumeclaims: "50"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: production-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:
      cpu: "500m"
      memory: 512Mi
    defaultRequest:
      cpu: "100m"
      memory: 128Mi
    max:
      cpu: "4"
      memory: 8Gi
    min:
      cpu: "50m"
      memory: 64Mi
```

---

## 7. 企业级运维脚本

### 7.1 一键部署脚本

```bash
#!/bin/bash
set -e

NAMESPACE="production"
APP_NAME="user-service"
IMAGE_TAG="v2.1.0"

# 1. 验证集群连接
kubectl cluster-info

# 2. 检查命名空间
kubectl get namespace $NAMESPACE || kubectl create namespace $NAMESPACE

# 3. 部署应用
kubectl apply -f manifests/deployment.yaml -n $NAMESPACE

# 4. 等待滚动更新完成
kubectl rollout status deployment/$APP_NAME -n $NAMESPACE --timeout=300s

# 5. 验证Pod状态
kubectl get pods -n $NAMESPACE -l app=$APP_NAME

# 6. 检查健康状态
kubectl exec -n $NAMESPACE deploy/$APP_NAME -- curl -s localhost:8080/health

# 7. 查看日志
kubectl logs -n $NAMESPACE -l app=$APP_NAME --tail=100

echo "部署完成！"
```

### 7.2 蓝绿部署

```bash
#!/bin/bash
# 蓝绿部署脚本

BLUE_VERSION="v2.0.0"
GREEN_VERSION="v2.1.0"

# 更新Service指向Green
kubectl patch service user-service -p '{"spec":{"selector":{"version":"'$GREEN_VERSION'"}}}'

# 健康检查
sleep 10
kubectl exec -n production deploy/user-service -- curl -s localhost:8080/health

# 原版本保留用于快速回滚
echo "Green $GREEN_VERSION 已上线，原版本 $BLUE_VERSION 保留用于回滚"
echo "如需回滚：kubectl patch service user-service -p '{\"spec\":{\"selector\":{\"version\":\"'$BLUE_VERSION'\"}}}'"
```

---

## 8. 常见问题排查

### 8.1 Pod无法启动

```bash
# 查看Pod状态
kubectl get pods -n production -l app=user-service

# 查看事件
kubectl describe pod <pod-name> -n production

# 查看日志
kubectl logs <pod-name> -n production --previous

# 检查资源限制
kubectl top pod <pod-name> -n production
```

### 8.2 Service无法访问

```bash
# 检查Endpoint
kubectl get endpoints user-service -n production

# 测试连通性
kubectl run test --rm -it --image=busybox --restart=Never -- \
  wget -qO- http://user-service.production.svc.cluster.local:8080/health

# 检查网络策略
kubectl get networkpolicy -n production
```

---

## 9. 相关资源

- [[Netflix 技术架构实战]]
- [[Istio 服务网格实战]]
- [[Helm Charts 最佳实践]]

---

*来源: kubernetes.io & 企业实战经验*
*最后更新: 2026-05-31*