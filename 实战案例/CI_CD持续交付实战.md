# CI/CD 持续交付实战

> Jenkins + GitLab CI + Argo CD 企业级流水线

---

## 1. CI/CD 整体流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         软件交付流水线                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │  代码   │ → │  编译   │ → │  测试   │ → │  构建   │ → │  部署   │     │
│  │  提交   │   │  构建   │   │  单元   │   │  镜像   │   │  环境   │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│      │                                                   ↓               │
│      │              ┌─────────────────────────────────────────┐         │
│      │              │  GitLab CI / Jenkins                    │         │
│      │              │  - 自动化构建                            │         │
│      │              │  - 质量门禁                              │         │
│      │              │  - 镜像推送                              │         │
│      │              └─────────────────────────────────────────┘         │
│      │                                                    ↓            │
│      │              ┌─────────────────────────────────────────┐         │
│      │              │  Argo CD / Argo Rollout                  │         │
│      │              │  - GitOps 声明式部署                      │         │
│      │              │  - 渐进式发布                            │         │
│      │              │  - 自动回滚                              │         │
│      │              └─────────────────────────────────────────┘         │
│      ↓                                                    ↓            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Dev → Test → Staging → Production                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. GitLab CI 流水线

### 2.1 .gitlab-ci.yml

```yaml
stages:
  - build
  - test
  - analyze
  - build-image
  - deploy

variables:
  DOCKER_REGISTRY: registry.example.com
  APP_IMAGE: ${DOCKER_REGISTRY}/${CI_PROJECT_PATH_SLUG}

# 缓存配置
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - .m2/repository/
    - build/

# 阶段1: 编译构建
build:
  stage: build
  image: maven:3.8-openjdk-17
  before_script:
    - chmod +x mvnw
  script:
    - ./mvnw clean package -DskipTests
  artifacts:
    paths:
      - target/*.jar
      - target/docker/
    expire_in: 1 week
  only:
    - main
    - develop
    - develop@group/project

# 阶段2: 单元测试
test:unit:
  stage: test
  image: maven:3.8-openjdk-17
  script:
    - ./mvnw test
  coverage: '/Total coverage: (\d+\.\d+)%/'
  coverage_display_name: coverage
  artifacts:
    paths:
      - target/surefire-reports/
      - target/site/jacoco/
    expire_in: 1 week
  only:
    - merge_requests
    - main
    - develop
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH == "develop"

# 阶段3: 代码分析
test:sonar:
  stage: analyze
  image: sonarsource/sonar-scanner-cli:latest
  script:
    - sonar-scanner
        -Dsonar.projectKey=${CI_PROJECT_PATH_SLUG}
        -Dsonar.projectName=${CI_PROJECT_NAME}
        -Dsonar.host.url=${SONAR_HOST}
        -Dsonar.token=${SONAR_TOKEN}
        -Dsonar.java.binaries=target/classes
        -Dsonar.sourceEncoding=UTF-8
  allow_failure: true  # 不阻塞发布
  only:
    - main
    - develop

# 阶段4: 安全扫描
security:trivy:
  stage: analyze
  image: aquasec/trivy:latest
  before_script:
    - trivy --version
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL ${APP_IMAGE}:${CI_COMMIT_SHA}
  allow_failure: true
  only:
    - main

# 阶段5: 构建镜像
build:image:
  stage: build-image
  image: docker:24-dind
  services:
    - docker:dind
  before_script:
    - docker login -u ${CI_REGISTRY_USER} -p ${CI_REGISTRY_PASSWORD} ${DOCKER_REGISTRY}
  script:
    - docker build -t ${APP_IMAGE}:${CI_COMMIT_SHA} .
    - docker tag ${APP_IMAGE}:${CI_COMMIT_SHA} ${APP_IMAGE}:latest
    - docker push ${APP_IMAGE}:${CI_COMMIT_SHA}
    - docker push ${APP_IMAGE}:latest
  dependencies:
    - build
  only:
    - main
    - develop

# 阶段6: 部署
deploy:dev:
  stage: deploy
  image: bitnami/kubectl:latest
  environment:
    name: development
    url: https://dev.example.com
  script:
    - kubectl set image deployment/${CI_PROJECT_NAME} app=${APP_IMAGE}:${CI_COMMIT_SHA} -n development
    - kubectl rollout status deployment/${CI_PROJECT_NAME} -n development
    - kubectl create configmap ${CI_PROJECT_NAME}-commit --from-literal=sha=${CI_COMMIT_SHA} --from-literal=author=${CI_AUTHOR} -n development --dry-run=client -o yaml | kubectl apply -f-
  only:
    - develop
  when: manual

deploy:staging:
  stage: deploy
  image: bitnami/kubectl:latest
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - kubectl set image deployment/${CI_PROJECT_NAME} app=${APP_IMAGE}:${CI_COMMIT_SHA} -n staging
    - kubectl annotate deployment/${CI_PROJECT_NAME} kubernetes.io/change-cause="Deploy ${CI_COMMIT_SHA} by ${CI_AUTHOR}" -n staging
  only:
    - main
  when: manual

deploy:production:
  stage: deploy
  image: bitnami/kubectl:latest
  environment:
    name: production
    url: https://api.example.com
  script:
    - kubectl set image deployment/${CI_PROJECT_NAME} app=${APP_IMAGE}:${CI_COMMIT_SHA} -n production
    - kubectl annotate deployment/${CI_PROJECT_NAME} kubernetes.io/change-cause="Deploy ${CI_COMMIT_SHA} by ${CI_AUTHOR}" -n production
    # 发送通知
    - curl -X POST "${SLACK_WEBHOOK}" -d "{\"text\":\"Production deployed: ${CI_PROJECT_NAME}:${CI_COMMIT_SHA}\"}"
  only:
    - main
  when: manual
```

### 2.2 多项目流水线触发

```yaml
# downstream 项目触发
trigger-downstream:
  stage: deploy
  trigger:
    project: group/integration-tests
    branch: main
    strategy: depend

# 跨项目管道
integration:api:
  stage: test
  trigger:
    project: group/api-tests
    strategy: parallel
  variables:
    API_VERSION: $CI_COMMIT_SHA
```

---

## 3. Jenkins 流水线

### 3.1 Jenkinsfile

```groovy
pipeline {
    agent any
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }
    
    environment {
        DOCKER_REGISTRY = credentials('docker-registry')
        SONAR_TOKEN = credentials('sonar-token')
        KUBECONFIG = credentials('kubeconfig')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Build') {
            parallel {
                stage('Backend') {
                    when { expression { params.BUILD_BACKEND == true } }
                    steps {
                        dir('backend') {
                            sh '''
                                ./mvnw clean package -DskipTests
                            '''
                        }
                    }
                }
                
                stage('Frontend') {
                    when { expression { params.BUILD_FRONTEND == true } }
                    steps {
                        dir('frontend') {
                            sh '''
                                npm ci
                                npm run build
                            '''
                        }
                    }
                }
            }
        }
        
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        dir('backend') {
                            sh './mvnw test'
                        }
                        junit 'backend/target/surefire-reports/*.xml'
                    }
                }
                
                stage('Integration Tests') {
                    steps {
                        dir('backend') {
                            sh './mvnw verify -Dspring.profiles.active=test'
                        }
                    }
                }
                
                stage('E2E Tests') {
                    steps {
                        sh 'npm run test:e2e'
                    }
                }
            }
        }
        
        stage('Security') {
            steps {
                sh 'trivy image --exit-code 0 --severity HIGH,CRITICAL --ignore-unfixed ${DOCKER_REGISTRY}/app:${GIT_COMMIT_SHORT}'
            }
        }
        
        stage('Build & Push Image') {
            steps {
                script {
                    def imageTag = "${env.BRANCH_NAME}-${env.GIT_COMMIT_SHORT}"
                    if (env.BRANCH_NAME == 'main') {
                        imageTag = env.GIT_COMMIT_SHORT
                    }
                    
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-registry') {
                        def image = docker.build("${DOCKER_REGISTRY}/app:${imageTag}", """
                            --build-arg VERSION=${imageTag}
                            --label git.sha=${env.GIT_COMMIT}
                            .
                        """)
                        image.push()
                        
                        if (env.BRANCH_NAME == 'main') {
                            image.push('latest')
                        }
                    }
                    
                    currentBuild.displayName = "#${env.BUILD_NUMBER} - ${imageTag}"
                }
            }
        }
        
        stage('Deploy to Dev') {
            when { expression { env.BRANCH_NAME in ['develop', 'main'] } }
            steps {
                script {
                    sh '''
                        kubectl --kubeconfig=${KUBECONFIG} set image deployment/app \\
                            app=${DOCKER_REGISTRY}/app:${BRANCH_NAME}-${GIT_COMMIT_SHORT} \\
                            -n development
                    '''
                    echo "Deployed to Dev: ${BRANCH_NAME}-${GIT_COMMIT_SHORT}"
                }
            }
        }
        
        stage('Deploy to Staging') {
            when { expression { env.BRANCH_NAME == 'main' } }
            steps {
                input message: 'Deploy to Staging?', ok: 'Deploy'
                script {
                    sh '''
                        kubectl --kubeconfig=${KUBECONFIG} set image deployment/app \\
                            app=${DOCKER_REGISTRY}/app:${GIT_COMMIT_SHORT} \\
                            -n staging
                        kubectl rollout status deployment/app -n staging
                    '''
                }
            }
        }
        
        stage('Deploy to Production') {
            when { expression { env.BRANCH_NAME == 'main' } }
            steps {
                input message: 'Deploy to Production?', ok: 'Deploy'
                script {
                    sh '''
                        kubectl --kubeconfig=${KUBECONFIG} set image deployment/app \\
                            app=${DOCKER_REGISTRY}/app:${GIT_COMMIT_SHORT} \\
                            -n production
                        kubectl rollout status deployment/app -n production
                    '''
                    slackSend(
                        channel: '#releases',
                        message: "Production deployed: ${env.PROJECT_NAME}@${env.GIT_COMMIT_SHORT}"
                    )
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        failure {
            slackSend(
                channel: '#builds',
                color: 'danger',
                message: "Build ${env.BUILD_NUMBER} FAILED"
            )
        }
        success {
            archiveArtifacts artifacts: '**/target/**/*.jar'
        }
    }
}
```

### 3.2 Jenkins Shared Library

```groovy
// vars/deployKubernetes.groovy
def call(Map config) {
    def namespace = config.namespace ?: 'default'
    def deployment = config.deployment ?: env.JOB_NAME
    def image = config.image
    def timeout = config.timeout ?: '300s'
    
    sh """
        kubectl set image deployment/${deployment} \\
            app=${image} \\
            -n ${namespace}
        
        kubectl rollout status deployment/${deployment} \\
            -n ${namespace} \\
            --timeout=${timeout}
    """
    
    echo "Deployed ${image} to ${namespace}/${deployment}"
}

// vars/notifySlack.groovy
def call(String message, String status = 'INFO') {
    def color = status == 'SUCCESS' ? 'good' : (status == 'FAILURE' ? 'danger' : 'warning')
    
    slackSend(
        channel: '#deployments',
        color: color,
        message: "${message} - ${env.JOB_NAME} #${env.BUILD_NUMBER}"
    )
}
```

---

## 4. Argo CD GitOps 部署

### 4.1 Argo CD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: user-service
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: production
  source:
    repoURL: https://github.com/company/user-service.git
    targetRevision: main
    path: k8s/overlays/production
    kustomize:
      images:
        - ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
    automatedApproval:
      enabled: true
  
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
  
  revisionHistoryLimit: 10
```

### 4.2 Kustomize 配置

```yaml
# k8s/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    spec:
      containers:
      - name: app
        image: user-service:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
```

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production

commonLabels:
  environment: production

bases:
  - ../../base

replicas:
  - name: user-service
    count: 5

images:
  - name: user-service
    newName: registry.example.com/user-service
    newTag: v2.1.0

patches:
  - patch: |-
      - op: replace
        path: /spec/replicas
        value: 5
    target:
      kind: Deployment
  - patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/cpu
        value: "1000m"
    target:
      kind: Deployment
```

### 4.3 Argo Rollout 渐进式发布

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: user-service
  namespace: production
spec:
  replicas: 10
  strategy:
    canary:
      canaryService: user-service-canary
      stableService: user-service-stable
      trafficRouter: ambassador
      ambassador:
        mappings:
          - user-service: user-service-stable
      steps:
        - setWeight: 5
        - pause: {duration: 5m}
        - setWeight: 20
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
        - setWeight: 80
        - pause: {duration: 5m}
        - setWeight: 100
      canaryMetadata:
        labels:
          role: canary
      stableMetadata:
        labels:
          role: stable
      analysis:
        templates:
          - templateName: success-rate
        args:
          - name: service-name
            value: user-service
      metricsServer:
        url: http://prometheus-operated.monitoring:9090
```

---

## 5. 质量门禁

### 5.1 SonarQube 质量配置

```json
{
  "projectSettings": {
    "qualityGate": {
      "name": "Production Gate",
      "conditions": [
        {
          "metric": "coverage",
          "operator": "LESS_THAN",
          "value": "80"
        },
        {
          "metric": "duplicated_lines_density",
          "operator": "GREATER_THAN",
          "value": "3"
        },
        {
          "metric": "code_smells",
          "operator": "GREATER_THAN",
          "value": "50"
        },
        {
          "metric": "vulnerabilities",
          "operator": "GREATER_THAN",
          "value": "0"
        },
        {
          "metric": "security_hotspots",
          "operator": "GREATER_THAN",
          "value": "10"
        },
        {
          "metric": "maintainability_rating",
          "operator": "WORSE_THAN",
          "value": "A"
        }
      ]
    }
  }
}
```

### 5.2 测试覆盖率要求

```yaml
# Maven 配置
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <configuration>
        <rules>
            <rule>
                <element>CLASS</element>
                <limits>
                    <limit>
                        <counter>LINE</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.80</minimum>
                    </limit>
                    <limit>
                        <counter>BRANCH</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.70</minimum>
                    </limit>
                </limits>
            </rule>
        </rules>
    </configuration>
</plugin>
```

---

## 6. 发布流程

### 6.1 发布检查清单

| 检查项 | 检查内容 | 通过标准 |
|--------|----------|----------|
| 代码审查 | 至少2人Review | Approved |
| 测试覆盖 | 单元+集成+E2E | >80% |
| 安全扫描 | Trivy + SonarQube | 无高危漏洞 |
| 性能测试 | P99延迟 < 200ms | 通过 |
| 文档更新 | API文档更新 | 已提交 |
| 回滚方案 | 回滚脚本可用 | 已验证 |

### 6.2 一键回滚

```bash
#!/bin/bash
# 回滚脚本 - 保留最近5个版本

NAMESPACE=$1
DEPLOYMENT=$2
MAX_KEEP=5

if [ -z "$NAMESPACE" ] || [ -z "$DEPLOYMENT" ]; then
    echo "Usage: $0 <namespace> <deployment>"
    exit 1
fi

# 获取历史版本
echo "=== 当前版本 ==="
kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].image}'

echo ""
echo "=== 历史版本 ==="
kubectl rollout history deployment/$DEPLOYMENT -n $NAMESPACE

# 回滚到上一版本
echo ""
read -p "输入要回滚的版本号（留空回滚到上一版本）: " VERSION

if [ -z "$VERSION" ]; then
    echo "回滚到上一版本..."
    kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE
else
    echo "回滚到版本 $VERSION..."
    kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE --to-revision=$VERSION
fi

# 检查状态
kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=120s

echo ""
echo "=== 回滚后版本 ==="
kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].image}'
```

---

## 7. 相关资源

- [[Kubernetes 企业级实战]]
- [[Helm Charts 最佳实践]]
- [[GitHub 热门项目 - 总索引]]

---

*来源: 企业 CI/CD 实战经验*
*最后更新: 2026-05-31*