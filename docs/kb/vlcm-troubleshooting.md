# vSphere Lifecycle Manager (vLCM) Troubleshooting

> Reference: [Broadcom KB 318195](https://knowledge.broadcom.com/external/article/318195), [Broadcom KB 373331](https://knowledge.broadcom.com/external/article/373331), [Broadcom KB 390121](https://knowledge.broadcom.com/external/article/390121)

## vLCM Overview

vSphere Lifecycle Manager (vLCM) replaced the legacy vSphere Update Manager (VUM) in vSphere 7.0. It provides two management modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Baselines** | Legacy VUM-style patch management | Traditional patching, mixed-vendor clusters |
| **Images** | Declarative desired-state model | Standardized host images, firmware inclusion |

---

## Check Notification Task Flooding (KB 318195)

### Symptoms
- **최근 작업(Recent Tasks)** 에 `VMware vSphere Lifecycle Manager Check Notification` 작업이 반복 생성
- 작업 상태: Queued 또는 Failed (완료되지 않음)
- 이니시에이터: `VMware vSphere Update Manager`
- 작업을 편집하거나 삭제할 수 없음
- 불필요한 이메일 알림 수신
- 로그: `No record - VCIDB ERROR: Row with key schedule-902 not found`

### Root Cause
vCenter 6.7 → 7.0 업그레이드 시 발생. VUM의 `Check Notification` 스케줄 작업이 vSphere 7.0에서 deprecated되었으나, 업그레이드 과정에서 DB 레코드가 삭제되지 않아 지속적으로 실행 시도됨. vSphere 7.0 U2에서 UI 옵션은 제거되었지만 DB 레코드는 잔존.

### Resolution

#### Method 1: Update Manager 서비스 재시작 + DB 정리 (권장)

```bash
# 1. VCSA SSH 접속 (root)
# 2. BASH 셸 진입
shell

# 3. Update Manager 서비스 중지
service-control --stop vmware-updatemgr

# 4. PostgreSQL 접속
/opt/vmware/vpostgres/current/bin/psql -U postgres -d VCDB

# 5. deprecated 설정 레코드 삭제
DELETE FROM vci_textfiles WHERE keystr='integrity.NewUpdateConfigSpec_Notification';

# 6. 확인
SELECT * FROM vci_textfiles WHERE keystr LIKE '%Notification%';
# (결과 없음이면 성공)

# 7. psql 종료
\q

# 8. Update Manager 서비스 시작
service-control --start vmware-updatemgr

# 9. 서비스 상태 확인
service-control --status vmware-updatemgr
```

#### Method 2: 스케줄 작업 직접 삭제 (Method 1 실패 시)

```bash
# 1. VCSA SSH → BASH 셸
shell

# 2. PostgreSQL 접속
/opt/vmware/vpostgres/current/bin/psql -U postgres -d VCDB

# 3. Check Notification 스케줄 작업 ID 확인
SELECT id, name FROM vpx_scheduled_task WHERE name LIKE '%Notification%';

# 4. 관련 레코드 삭제 (action, scheduler, task 순서)
DELETE FROM vpx_sched_task_action WHERE task_id = '<task_id>';
DELETE FROM vpx_scheduler WHERE task_id = '<task_id>';
DELETE FROM vpx_scheduled_task WHERE id = '<task_id>';

# 5. psql 종료
\q

# 6. vCenter 및 Update Manager 서비스 재시작
service-control --stop vmware-updatemgr
service-control --stop vmware-vpxd
service-control --start vmware-vpxd
service-control --start vmware-updatemgr
```

#### Method 3: PowerCLI (다운타임 없음)

```powershell
Connect-VIServer -Server <vcenter-fqdn> -User administrator@vsphere.local

$si = Get-View ServiceInstance
$schedMgr = Get-View $si.Content.ScheduledTaskManager

$schedMgr.ScheduledTask | ForEach-Object {
    $task = Get-View $_
    if ($task.Info.Name -like "*Notification*" -or $task.Info.Name -like "*Check Notification*") {
        Write-Host "Found: $($task.Info.Name) - Removing..."
        $task.RemoveScheduledTask()
        Write-Host "Removed successfully."
    }
}
```

### Risk Assessment
| 항목 | 평가 |
|------|------|
| 영향도 | 낮음 — deprecated 기능 삭제 |
| 다운타임 | Method 1: vmware-updatemgr 재시작 (~2분) |
| | Method 2: vpxd + updatemgr 재시작 (~10분) |
| | Method 3: 다운타임 없음 |
| 사전 조치 | VCSA 파일 기반 백업 권장 |

### Reference
- [Broadcom KB 318195](https://knowledge.broadcom.com/external/article/318195) — Failed or queued vLCM Check Notification tasks in vCenter Server 7.x

---

## vLCM 옵션 회색 처리 (Greyed Out) (KB 373331)

### Symptoms
- vCenter 업그레이드 후 vLCM 메뉴 옵션이 비활성화(greyed out)
- Updates 탭에서 Baselines/Images 옵션 사용 불가
- vLCM 플러그인이 "Incompatible" 표시

### Root Cause
업그레이드 과정에서 vLCM 클라이언트 확장 등록이 불완전하거나, 플러그인 호환성 매트릭스 파일에서 해당 플러그인이 비호환으로 표시됨.

### Resolution

```bash
# 1. vLCM 플러그인 상태 확인
# vSphere Client > Administration > Solutions > Client Plugins

# 2. 플러그인 호환성 확인
cat /etc/vmware/vsphere-ui/compatibility-matrix.xml | grep -i lifecycle

# 3. vSphere Client 서비스 재시작
service-control --stop vsphere-ui
service-control --start vsphere-ui

# 4. 브라우저 캐시 클리어 후 재접속
```

### Reference
- [Broadcom KB 373331](https://knowledge.broadcom.com/external/article/373331) — vLCM options greyed out after upgrading vCenter Server
- [Broadcom KB 391927](https://knowledge.broadcom.com/external/article/391927) — Lifecycle Manager missing on vSphere UI
- [Broadcom KB 301486](https://knowledge.broadcom.com/external/article/301486) — After upgrading vCenter, vLCM updates tab missing Baselines/Image

---

## vLCM 패치 다운로드 실패

### HTTP 403 Error (KB 390121)

Broadcom 이전 후 온라인 리포지토리에서 패치 다운로드 시 403 에러 발생.

```
Error: A general system error occurred: Failed to download VIB(s)
Error: HTTP Error Code: 403
```

### Root Cause
Broadcom 인수 후 패치 리포지토리 URL이 토큰 기반으로 변경됨. 기존 VMware 리포지토리 URL은 더 이상 유효하지 않음.

### Resolution

```bash
# 1. Broadcom Support Portal에서 Download Token 발급
# https://support.broadcom.com > VMware Downloads

# 2. vCenter에서 Download Source 재설정
# vSphere Client > Menu > Lifecycle Manager > Settings > Download Sources

# 3. 새 토큰 기반 URL 등록
# ESXi Host Depot:
#   https://dl.broadcom.com/<TOKEN>/PROD/COMP/ESX_HOST/main/vmw-depot-index.xml
# VMware Tools:
#   https://dl.broadcom.com/<TOKEN>/PROD/COMP/VMTOOLS/main/vmw-depot-index.xml
```

### Reference
- [Broadcom KB 390121](https://knowledge.broadcom.com/external/article/390121) — vLCM fails to download with HTTP 403
- [Broadcom KB 394508](https://knowledge.broadcom.com/external/article/394508) — Cannot download VIB with Token based URL
- [Broadcom KB 393951](https://knowledge.broadcom.com/external/article/393951) — Token update process fails
- [Broadcom KB 396620](https://knowledge.broadcom.com/external/article/396620) — Unable to add new Patch Token URL

---

## vLCM Proxy 설정 문제 (KB 372589)

### Key Facts
- vLCM은 프록시 연결에 **HTTPS를 지원하지 않음** (Python requests 모듈 제한)
- 프록시 서버 연결은 반드시 **HTTP** 사용 (최종 타겟 URL은 HTTPS 가능)

### Diagnosis

```bash
# 프록시 설정 확인
grep -i proxy /etc/vmware/environment

# 프록시를 통한 연결 테스트
curl -x http://<proxy>:<port> https://dl.broadcom.com/ -v

# vLCM 로그 확인
tail -200 /var/log/vmware/vmware-updatemgr/vum-server/vmware-vum-server.log
```

### Resolution
```bash
# vSphere Client > Lifecycle Manager > Settings > Proxy Settings
# Proxy URL: http://<proxy-host>:<port> (HTTPS 아님!)
# No Proxy에 내부 호스트 추가: vcenter.local,*.local
```

### Reference
- [Broadcom KB 372589](https://knowledge.broadcom.com/external/article/372589) — vLCM proxy configuration troubleshooting
- [Broadcom KB 326280](https://knowledge.broadcom.com/external/article/326280) — No Proxy setting issue in vSphere 7.0.2
- [Broadcom KB 80838](https://knowledge.broadcom.com/external/article?legacyId=80838) — vLCM fails to download with HTTPS proxy

---

## vLCM Remediation 실패

### Compliance Check 실패 (KB 391967, 379329)

```
"compliance results for the host are unavailable"
"An internal error occurred during execution"
```

#### Root Cause
- HSM 통신 불가로 호스트 펌웨어 정보 미수집
- HCL 캐시 DB 파일 손상

#### Resolution

```bash
# HCL 캐시 DB 삭제 (안전 — 캐시 파일일 뿐)
rm /etc/vmware/lifecycle/vsan_hcl_cache.db

# vLCM 서비스 재시작
service-control --stop vmware-updatemgr
service-control --start vmware-updatemgr

# Compliance 재확인
# vSphere Client > Cluster > Updates > Check Compliance
```

### VIB 다운로드 실패 (KB 317905, 340445)

```
"Cannot download VIB"
```

#### Common Causes
| 원인 | 해결 |
|------|------|
| 네트워크 연결 불가 | 프록시/방화벽 확인, DNS resolution 테스트 |
| 토큰 미인증 | Broadcom Portal에서 토큰 재발급 |
| VIB 경로 변경 | 리포지토리 URL 업데이트 |
| 디스크 공간 부족 | `/storage/updatemgr/` 디스크 공간 확인 |

#### Resolution

```bash
# 디스크 공간 확인
df -h /storage/

# vLCM 다운로드 캐시 정리
rm -rf /storage/updatemgr/patch-store/*

# vLCM 서비스 재시작
service-control --stop vmware-updatemgr
service-control --start vmware-updatemgr
```

### Image vs Baseline 전환 시 Drift (KB 311882)

Baselines에서 Images 모드로 전환 시 VIB/Component 제거 알림이 표시될 수 있음.

#### Resolution
- Images 모드로 전환 후 compliance check에서 제거 대상 VIB 확인
- 해당 VIB가 필수인지 확인 후 remediation 수행
- 제거 알림이 표시되어도 호스트에는 영향 없음 (remediation 전까지)

### Reference
- [Broadcom KB 391967](https://knowledge.broadcom.com/external/article/391967) — Cluster remediation fails with compliance unavailable
- [Broadcom KB 379329](https://knowledge.broadcom.com/external/article/379329) — Hardware compatibility check internal error
- [Broadcom KB 317905](https://knowledge.broadcom.com/external/article/317905) — Cannot download VIB upgrading to ESXi 7.0 U2
- [Broadcom KB 340445](https://knowledge.broadcom.com/external/article/340445) — Cannot download VIB upgrading to ESXi 7.0 U3
- [Broadcom KB 311882](https://knowledge.broadcom.com/external/article/311882) — Baselines to Images drift notifications
- [Broadcom KB 395691](https://knowledge.broadcom.com/external/article/395691) — vLCM Image remediation non-compliant error
- [Broadcom KB 312071](https://knowledge.broadcom.com/external/article/312071) — Orphan VIB messages handling in vLCM

---

## vLCM 로그 파일 위치

```bash
# vLCM / Update Manager 서비스 로그
/var/log/vmware/vmware-updatemgr/vum-server/vmware-vum-server.log

# Image Service 로그 (Images 모드)
/var/log/vmware/lifecycle/imageservice.log

# vLCM 다운로드 로그
/var/log/vmware/vmware-updatemgr/vum-server/download.log

# vLCM 상태 확인
service-control --status vmware-updatemgr
```

---

## vLCM Diagnostic Commands

```bash
# vLCM 서비스 상태
service-control --status vmware-updatemgr

# 다운로드 소스 확인
# vSphere Client > Lifecycle Manager > Settings > Download Sources

# 패치 저장소 디스크 사용량
du -sh /storage/updatemgr/

# vLCM 프록시 설정 확인
grep -i proxy /etc/vmware/environment

# VIB 메타데이터 캐시 확인
ls -la /storage/updatemgr/patch-store/

# vLCM 관련 스케줄 작업 확인 (PostgreSQL)
/opt/vmware/vpostgres/current/bin/psql -U postgres -d VCDB \
    -c "SELECT id, name, state FROM vpx_scheduled_task WHERE name LIKE '%Lifecycle%' OR name LIKE '%Update Manager%' OR name LIKE '%Notification%';"
```
