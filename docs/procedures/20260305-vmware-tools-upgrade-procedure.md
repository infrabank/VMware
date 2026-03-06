# VMware Tools 업그레이드 작업 절차서

| 항목 | 내용 |
|------|------|
| **문서번호** | OPS-VMW-20260305-002 |
| **작업명** | VMware Tools 12.5.4 업그레이드 (ESXi VIB 교체 + Windows/Linux 게스트 VM 일괄 업데이트) |
| **작업일시** | 2026년 3월 __ 일 (__) __:__ ~ __:__ |
| **작업자** | |
| **승인자** | |
| **작성일** | 2026년 3월 5일 |

---

## 1. 작업 개요

### 1.1 작업 목적

ESXi 호스트에 탑재된 VMware Tools VIB를 최신 버전(12.5.4)으로 교체하고,
운영 중인 Windows VM 및 Linux VM의 게스트 Tools를 일괄 업그레이드한다.

- **Windows VM**: PowerCLI `Update-Tools` NoReboot 방식
- **Linux VM**: VMware OSP 리포지토리 경유 `open-vm-tools` 업그레이드

### 1.2 작업 대상

| 대상 | 현재 버전 | 목표 버전 |
|------|-----------|-----------|
| ESXi 호스트 Tools VIB | 확인 필요 (사전 점검 수행) | **12.5.4 (Build 24964629)** |
| Windows VM 게스트 Tools | 확인 필요 (사전 점검 수행) | **12.5.4 (Build 24964629)** |
| Linux VM open-vm-tools | 확인 필요 (사전 점검 수행) | **최신 지원 버전 (OSP 리포지토리 기준)** |

### 1.3 사용 파일

| 파일명 | 용도 |
|--------|------|
| `VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip` | vLCM Depot 업로드 / esxcli 수동 설치용 |

### 1.4 작업 단계 요약

| Phase | 내용 | 방법 | 재부팅 |
|-------|------|------|--------|
| Phase 1 | 사전 현황 파악 (Windows + Linux) | PowerCLI + SSH | 없음 |
| Phase 2 | ESXi 호스트 Tools VIB 교체 | vLCM Remediation | **호스트 재부팅** |
| Phase 3 | Windows VM Tools 일괄 업그레이드 | PowerCLI NoReboot | **없음 (별도 일정)** |
| Phase 4 | Windows VM 업그레이드 결과 검증 | PowerCLI | 없음 |
| Phase 5 | Windows VM 재부팅 처리 | PowerCLI | **VM별 Guest Reboot** |
| Phase 6 | Linux VM open-vm-tools 업그레이드 | PowerCLI Invoke-VMScript | **서비스 재시작만** |
| Phase 7 | Linux VM 업그레이드 결과 검증 | PowerCLI + SSH | 없음 |

### 1.5 서비스 영향

| Phase | 영향 범위 | 예상 시간 |
|-------|-----------|-----------|
| Phase 2 (ESXi VIB) | 호스트별 순차 재부팅. VM은 vMotion 대피. | 호스트당 15~20분 |
| Phase 3 (Windows Tools) | VM 내 Tools 서비스 재시작 (수 초). 업무 영향 없음. | VM당 1~3분 |
| Phase 5 (Windows 재부팅) | VM별 OS 재부팅. 유지보수 창 확보 필요. | VM당 3~5분 |
| Phase 6 (Linux Tools) | `vmtoolsd` 서비스 재시작 (수 초). 업무 영향 없음. | VM당 1~2분 |

---

## 2. 사전 준비 (작업 당일 이전 완료)

### 2.1 파일 준비

```
✅ VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip 다운로드 완료
✅ Broadcom Support Portal 접근 가능 여부 확인
✅ PowerCLI 최신 버전 설치 확인 (12.x 이상)
✅ vCenter 관리자 계정 준비
✅ Linux VM root 또는 sudo 계정 준비 (Invoke-VMScript 사용 시)
✅ Linux VM 인터넷/내부 리포지토리 접근 가능 여부 확인
```

### 2.2 PowerCLI 환경 확인

```powershell
# PowerCLI 버전 확인
Get-PowerCLIVersion

# 인증서 경고 무시 설정 (셀프 서명 인증서 환경)
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false

# vCenter 연결 테스트
$cred = Get-Credential -Message "vCenter 관리자 자격증명 입력"
Connect-VIServer -Server <vcenter-fqdn> -Credential $cred
```

### 2.3 작업 전 환경 스냅샷 (권장)

> **주의**: 프로덕션 환경의 경우 작업 전 주요 VM 스냅샷 생성 권장.
> 스냅샷 보관 기간: 작업 완료 확인 후 7일 이내 삭제.

```powershell
# Windows + Linux 전체 VM 스냅샷 생성
Get-VM | Where-Object { $_.PowerState -eq "PoweredOn" } |
    ForEach-Object {
        New-Snapshot -VM $_ `
            -Name "Pre-ToolsUpgrade-$(Get-Date -Format yyyyMMdd)" `
            -Description "VMware Tools 12.5.4 업그레이드 전 백업" `
            -Confirm:$false
        Write-Host "[Snapshot 생성] $($_.Name)"
    }
```

---

## 3. Phase 1 — 사전 현황 파악

### 3.1 ESXi 호스트 현재 Tools VIB 버전 확인

```bash
# ESXi 호스트 SSH 접속 후 (각 호스트별 실행)
esxcli software vib list | grep -i tools

# 출력 예:
# esx-tools-light    12.1.0.20219665-1OEM...    VMware    VMwareCertified
```

```powershell
# PowerCLI로 전체 호스트 일괄 확인
Get-VMHost | Sort-Object Name | ForEach-Object {
    $esxcli = Get-EsxCli -VMHost $_ -V2
    $vibs   = $esxcli.software.vib.list.Invoke() |
              Where-Object { $_.Name -like "*tools*" }
    foreach ($vib in $vibs) {
        [PSCustomObject]@{
            Host    = $_.Name
            VIBName = $vib.Name
            Version = $vib.Version
            Date    = $vib.InstallDate
        }
    }
} | Format-Table -AutoSize
```

### 3.2 Windows VM Tools 현황 파악 및 CSV 저장

```powershell
# Windows VM Tools 상태 파악
$winAudit = Get-VM |
    Where-Object { $_.Guest.OSFullName -like "*Windows*" } |
    Select-Object Name,
        @{N="PowerState";   E={$_.PowerState}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object ToolsVersion

$winAudit | Export-Csv "C:\tools-audit-windows-$(Get-Date -Format yyyyMMdd).csv" -NoTypeInformation
$winAudit | Format-Table -AutoSize

Write-Host "Windows 업그레이드 대상: $(($winAudit | Where-Object {$_.ToolsStatus -eq 'toolsOld'}).Count) 대"
```

### 3.3 Linux VM Tools 현황 파악 및 CSV 저장

```powershell
# Linux VM Tools 상태 파악 (vCenter 기준)
$linuxAudit = Get-VM |
    Where-Object { $_.Guest.OSFullName -notlike "*Windows*" -and
                   $_.Guest.OSFullName -ne "" } |
    Select-Object Name,
        @{N="OS";           E={$_.Guest.OSFullName}},
        @{N="PowerState";   E={$_.PowerState}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object OS

$linuxAudit | Export-Csv "C:\tools-audit-linux-$(Get-Date -Format yyyyMMdd).csv" -NoTypeInformation
$linuxAudit | Format-Table -AutoSize

Write-Host "Linux VM 수: $($linuxAudit.Count) 대"
```

> **체크포인트**: Windows/Linux 현황 CSV를 작업 기록에 첨부한다.

---

## 4. Phase 2 — ESXi 호스트 Tools VIB 교체 (vLCM)

### 4.1 vLCM에 Depot 파일 업로드

```
1. vSphere Client 접속
   → Menu → Lifecycle Manager

2. [Updates] 탭 → 우측 상단 [Import Updates] 클릭

3. [Choose File] → VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip 선택
   → [Import] 클릭

4. 업로드 완료 확인
   → [Patch Repository] 탭
   → 검색창에 "tools" 입력
   → VMware Tools 12.5.4 항목 확인
```

### 4.2 Baseline 생성

```
1. Lifecycle Manager → [Baselines] 탭 → [+ New Baseline] 클릭

2. 정보 입력:
   - Name:        VMware-Tools-12.5.4-24964629
   - Description: VMware Tools 12.5.4 VIB 호스트 배포
   - Type:        ☑ Patch 또는 Extension

3. Patches/Extensions 선택 화면
   → 검색창: "VMware Tools" 또는 "esx-tools"
   → VMware Tools 12.5.4 (Build 24964629) 선택
   → [Next] → [Finish]
```

### 4.3 Baseline 클러스터에 연결 및 Compliance Check

```
1. Hosts & Clusters → 대상 클러스터 선택

2. [Updates] 탭 → [Baselines] 섹션
   → [Attach Baseline or Baseline Group] 클릭
   → 생성한 "VMware-Tools-12.5.4-24964629" 선택 → [Attach]

3. [Check Compliance] 클릭
   → Non-Compliant 호스트 목록 확인
   → 모든 호스트가 Non-Compliant 표시되어야 정상
```

### 4.4 Remediation 실행 (호스트 VIB 설치 + 재부팅)

> **위험도: HIGH** — 호스트 재부팅 발생. DRS Fully Automated 확인 후 진행.

```
1. [Remediate All] 클릭

2. Remediation 옵션 설정:
   ☑ Enable parallel remediation (병렬 처리 — 클러스터 규모에 따라 조정)
   ☑ Retry on failure (실패 시 재시도)
   ☑ Migrate powered-on virtual machines (DRS 환경 — VM 자동 대피)
   □ Disable Quick Boot (Quick Boot 지원 여부 확인 후 결정)

3. 일정:
   ○ 즉시 실행  ○ 예약 실행: _____년 ___월 ___일 ___:___

4. [Remediate] 클릭 → 진행 상황 모니터링
   Menu → Lifecycle Manager → [Monitor] → Remediation 상태 확인
```

### 4.5 VIB 교체 완료 확인

```powershell
Get-VMHost | Sort-Object Name | ForEach-Object {
    $esxcli = Get-EsxCli -VMHost $_ -V2
    $vib    = $esxcli.software.vib.list.Invoke() |
              Where-Object { $_.Name -like "*tools*" } |
              Select-Object -First 1
    [PSCustomObject]@{
        Host    = $_.Name
        Version = $vib.Version
        Status  = if ($vib.Version -like "*24964629*") { "✅ 완료" } else { "❌ 미완료" }
    }
} | Format-Table -AutoSize
```

> **체크포인트**: 전체 호스트 `✅ 완료` 확인 후 Phase 3 진행.

---

## 5. Phase 3 — Windows VM Tools 일괄 업그레이드 (NoReboot)

### 5.1 업그레이드 실행 스크립트

```powershell
# ============================================================
# VMware Tools Windows VM 일괄 업그레이드 스크립트
# 대상   : Windows VM (PoweredOn + toolsOld)
# 방식   : NoReboot (재부팅은 Phase 5에서 별도 처리)
# 버전   : 12.5.4 (Build 24964629)
# ============================================================

$logFile   = "C:\tools-upgrade-windows-$(Get-Date -Format yyyyMMdd-HHmm).log"
$batchSize = 5      # 배치당 VM 수 (vCenter 부하 고려)
$sleepSec  = 15     # 배치 간 대기 시간(초)

function Write-Log {
    param($msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -FilePath $logFile -Append
}

Write-Log "===== Windows VM Tools 업그레이드 시작 ====="

$targets = Get-VM | Where-Object {
    $_.Guest.OSFullName                -like "*Windows*" -and
    $_.PowerState                      -eq   "PoweredOn" -and
    $_.Guest.ExtensionData.ToolsStatus -eq   "toolsOld"
}

Write-Log "대상 VM 수: $($targets.Count)"

if ($targets.Count -eq 0) {
    Write-Log "업그레이드 대상 없음 — 종료"
    exit
}

$batches = for ($i = 0; $i -lt $targets.Count; $i += $batchSize) {
    , $targets[$i..([Math]::Min($i + $batchSize - 1, $targets.Count - 1))]
}

$batchNum = 1
foreach ($batch in $batches) {
    Write-Log "--- 배치 $batchNum / $($batches.Count) 시작 ---"
    foreach ($vm in $batch) {
        try {
            Write-Log "[START] $($vm.Name)  현재버전: $($vm.Guest.ToolsVersion)"
            Update-Tools -VM $vm -NoReboot -Confirm:$false
            Write-Log "[OK]    $($vm.Name)  업그레이드 명령 전달 완료"
        } catch {
            Write-Log "[FAIL]  $($vm.Name)  오류: $($_.Exception.Message)"
        }
    }
    Write-Log "배치 $batchNum 완료 — ${sleepSec}초 대기"
    Start-Sleep -Seconds $sleepSec
    $batchNum++
}

Write-Log "===== 전체 명령 전달 완료 — Phase 4 검증 진행 ====="
Write-Log "로그 파일: $logFile"
```

---

## 6. Phase 4 — Windows VM 업그레이드 결과 검증

### 6.1 전체 상태 확인 및 CSV 저장

```powershell
Write-Host "업그레이드 반영 대기 중 (90초)..."
Start-Sleep -Seconds 90

$resultFile = "C:\tools-result-windows-$(Get-Date -Format yyyyMMdd-HHmm).csv"

$result = Get-VM |
    Where-Object { $_.Guest.OSFullName -like "*Windows*" } |
    Select-Object Name,
        @{N="PowerState";    E={$_.PowerState}},
        @{N="ToolsVersion";  E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";   E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning";  E={$_.Guest.ExtensionData.ToolsRunningStatus}},
        @{N="VersionStatus"; E={$_.Guest.ExtensionData.ToolsVersionStatus2}} |
    Sort-Object ToolsStatus

$result | Export-Csv $resultFile -NoTypeInformation
$result | Format-Table -AutoSize

Write-Host "`n===== 요약 =====" -ForegroundColor Cyan
Write-Host "정상 (toolsOk)    : $(($result | Where-Object {$_.ToolsStatus -eq 'toolsOk'}).Count) 대"        -ForegroundColor Green
Write-Host "구버전 (toolsOld) : $(($result | Where-Object {$_.ToolsStatus -eq 'toolsOld'}).Count) 대"       -ForegroundColor Yellow
Write-Host "미설치            : $(($result | Where-Object {$_.ToolsStatus -eq 'toolsNotInstalled'}).Count) 대" -ForegroundColor Red
Write-Host "미가동            : $(($result | Where-Object {$_.ToolsStatus -eq 'toolsNotRunning'}).Count) 대"   -ForegroundColor Red
```

### 6.2 재부팅 필요 VM 목록 추출

```powershell
$rebootList = $result | Where-Object {
    $_.VersionStatus -eq "guestToolsSupportedNew" -or
    $_.ToolsStatus   -eq "toolsOld"
}

$rebootFile = "C:\tools-reboot-needed-$(Get-Date -Format yyyyMMdd-HHmm).csv"
$rebootList | Export-Csv $rebootFile -NoTypeInformation

Write-Host "재부팅 필요 VM: $($rebootList.Count) 대" -ForegroundColor Yellow
$rebootList | Select-Object Name, ToolsVersion, ToolsStatus, VersionStatus | Format-Table -AutoSize
```

### 6.3 검증 판단 기준

| 상태 | 판단 | 조치 |
|------|------|------|
| `toolsOk` + `guestToolsRunning` | ✅ 정상 완료 | 없음 |
| `toolsOk` + `guestToolsSupportedNew` | ⚠️ 업그레이드 완료, 재부팅 대기 | Phase 5 진행 |
| `toolsOld` | ❌ 업그레이드 미완료 | 원인 확인 후 재시도 |
| `toolsNotRunning` | ❌ 서비스 중지 | 게스트 내 서비스 확인 |
| `toolsNotInstalled` | ❌ 미설치 | 신규 설치 필요 |

---

## 7. Phase 5 — Windows VM 재부팅 처리 (유지보수 창)

> **전제**: 서비스 영향 최소화를 위해 유지보수 창에 진행.
> `Restart-VMGuest` = OS Graceful Shutdown (하드 리셋 아님).

```powershell
$rebootList = Import-Csv "C:\tools-reboot-needed-<날짜>.csv"

$batchSize = 3
$waitSec   = 60
$logFile   = "C:\tools-reboot-windows-$(Get-Date -Format yyyyMMdd-HHmm).log"

function Write-Log {
    param($msg)
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" |
        Tee-Object -FilePath $logFile -Append
}

Write-Log "===== Windows VM 재부팅 시작 — 총 $($rebootList.Count) 대 ====="

for ($i = 0; $i -lt $rebootList.Count; $i += $batchSize) {
    $batch = $rebootList[$i..([Math]::Min($i + $batchSize - 1, $rebootList.Count - 1))]
    foreach ($item in $batch) {
        $vm = Get-VM -Name $item.Name -ErrorAction SilentlyContinue
        if ($null -eq $vm -or $vm.PowerState -ne "PoweredOn") {
            Write-Log "[SKIP]   $($item.Name)"
            continue
        }
        try {
            Restart-VMGuest -VM $vm -Confirm:$false
            Write-Log "[REBOOT] $($vm.Name)"
        } catch {
            Write-Log "[FAIL]   $($vm.Name) — $($_.Exception.Message)"
        }
    }
    Write-Log "배치 완료 — ${waitSec}초 대기"
    Start-Sleep -Seconds $waitSec
}

Write-Log "===== 재부팅 명령 전달 완료 ====="
```

### 7.1 재부팅 후 최종 확인

```powershell
Start-Sleep -Seconds 300   # 재부팅 완료 대기

$finalResult = Get-VM |
    Where-Object { $_.Guest.OSFullName -like "*Windows*" } |
    Select-Object Name,
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}}

$finalResult | Export-Csv "C:\tools-final-windows-$(Get-Date -Format yyyyMMdd-HHmm).csv" -NoTypeInformation

$incomplete = $finalResult | Where-Object { $_.ToolsStatus -ne "toolsOk" }
if ($incomplete) {
    Write-Host "=== 미완료 VM ===" -ForegroundColor Red
    $incomplete | Format-Table -AutoSize
} else {
    Write-Host "=== Windows VM 전체 업그레이드 완료 ===" -ForegroundColor Green
}
```

---

## 8. Phase 6 — Linux VM open-vm-tools 업그레이드 (VMware OSP 리포지토리)

### 8.1 VMware OSP 리포지토리 개요

VMware OSP(OS Specific Packages) 리포지토리는 Broadcom이 공식 제공하는
배포판별 open-vm-tools 패키지 저장소입니다.

| 배포판 | 리포지토리 URL 패턴 |
|--------|---------------------|
| RHEL / CentOS / Rocky 8 | `https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/` |
| RHEL / CentOS / Rocky 9 | `https://packages.vmware.com/tools/esx/7.0latest/rhel9/x86_64/` |
| Ubuntu 20.04 (Focal) | `https://packages.vmware.com/tools/esx/7.0latest/ubuntu/dists/focal/` |
| Ubuntu 22.04 (Jammy) | `https://packages.vmware.com/tools/esx/7.0latest/ubuntu/dists/jammy/` |

### 8.2 네트워크 환경 판단 및 방법 선택

```
리포지토리 접근 테스트 (Linux 게스트 내부):

  curl -sk --max-time 5 https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/ \
      | grep -i "open-vm-tools" && echo "접근 가능" || echo "접근 불가"
```

```
접근 결과에 따라 아래 방법을 선택한다:

  ┌─ 인터넷 직접 접근 가능 ──────→ 8.3 OSP 리포지토리 스크립트 실행
  │
  ├─ 내부 미러 리포지토리 있음 ──→ 8.3 스크립트의 baseurl을 내부 URL로 교체 후 실행
  │                                  예) http://internal-mirror.lab.local/vmware-tools/rhel8/x86_64/
  │
  ├─ Air-gapped (소규모) ────────→ 8.4 패키지 파일 직접 전송 방법
  │
  └─ Air-gapped (버전 정확히
     12.5.4 필요 / 대규모) ──────→ 8.5 내부 미러 구성 또는 8.6 Bundled ISO 설치
```

---

### 8.4 Air-gapped 방법 1 — 패키지 파일 직접 전송 (소규모)

> **대상**: 인터넷 접근 불가, VM 수 소규모 (10대 이하), 내부 미러 없음

**① 외부 PC에서 패키지 다운로드**

```bash
# RHEL 8 계열 (인터넷 연결된 외부 PC에서 실행)
mkdir -p /tmp/vmtools-pkg
cd /tmp/vmtools-pkg

wget https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/open-vm-tools-<버전>.x86_64.rpm
wget https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/open-vm-tools-<버전>.x86_64.rpm.sha256

# Ubuntu 20.04 계열
wget https://packages.vmware.com/tools/esx/7.0latest/ubuntu/pool/main/o/open-vm-tools/open-vm-tools_<버전>_amd64.deb
```

**② 패키지 파일을 내부 전송**

```
방법 A: vSphere Client Datastore Browser → Datastore에 업로드
        → Linux VM 내부에서 /vmfs/volumes/... 경로로 복사

방법 B: USB / 내부 파일 서버 경유 SCP 전송
        scp open-vm-tools-*.rpm root@<linux-vm-ip>:/tmp/
```

**③ Linux 게스트 내부 설치**

```bash
# RHEL 계열 — RPM 직접 설치
rpm -Uvh /tmp/open-vm-tools-*.rpm

# 의존성 오류 발생 시:
dnf localinstall /tmp/open-vm-tools-*.rpm -y

# Ubuntu 계열 — DEB 직접 설치
dpkg -i /tmp/open-vm-tools_*.deb

# 의존성 오류 발생 시:
apt-get install -f -y   # 의존성 자동 해결 후 재시도

# 서비스 재시작 + 버전 확인
systemctl restart vmtoolsd
vmware-toolsd --version
```

---

### 8.5 Air-gapped 방법 2 — 내부 미러 리포지토리 구성 (중대규모)

> **대상**: 인터넷 접근 불가, VM 수 다수 (10대 이상), 내부 웹서버 사용 가능

**① 외부 PC에서 리포지토리 전체 동기화**

```bash
# RHEL 8 계열 전체 다운로드
mkdir -p /mirror/vmware-tools/rhel8/x86_64
wget -r -np -nH --cut-dirs=5 \
    https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/ \
    -P /mirror/vmware-tools/rhel8/x86_64/

# Ubuntu 20.04 계열 전체 다운로드
mkdir -p /mirror/vmware-tools/ubuntu
wget -r -np -nH --cut-dirs=4 \
    https://packages.vmware.com/tools/esx/7.0latest/ubuntu/ \
    -P /mirror/vmware-tools/ubuntu/
```

**② 내부 웹서버에 배포**

```bash
# Apache 예시 (내부 웹서버)
cp -r /mirror/vmware-tools /var/www/html/
systemctl reload httpd

# 접근 URL 확인:
# http://internal-mirror.lab.local/vmware-tools/rhel8/x86_64/
# http://internal-mirror.lab.local/vmware-tools/ubuntu/
```

**③ 8.3 스크립트의 baseurl을 내부 URL로 교체**

```bash
# RHEL 계열 — 내부 미러로 리포지토리 등록
cat > /etc/yum.repos.d/vmware-tools.repo << 'EOF'
[vmware-tools]
name=VMware Tools (Internal Mirror)
baseurl=http://internal-mirror.lab.local/vmware-tools/rhel8/x86_64/
enabled=1
gpgcheck=0
EOF

dnf upgrade open-vm-tools -y

# Ubuntu 계열 — 내부 미러로 리포지토리 등록
echo "deb http://internal-mirror.lab.local/vmware-tools/ubuntu focal main" \
    > /etc/apt/sources.list.d/vmware-tools.list
apt-get update && apt-get upgrade open-vm-tools -y
```

> **PowerCLI 일괄 처리**: 8.3 스크립트의 `baseurl` / `echo "deb ..."` 라인의
> URL만 내부 미러 주소로 교체하면 동일하게 일괄 적용 가능.

---

### 8.6 Air-gapped 방법 3 — Bundled ISO 설치 (버전 정확히 12.5.4)

> **대상**: 인터넷 접근 불가, 버전을 정확히 12.5.4로 고정해야 하는 경우
> **전제**: Phase 2 ESXi VIB 교체 완료 → 호스트 ISO가 12.5.4로 업데이트된 상태

**① 컴파일 도구 사전 설치 (게스트 내부 또는 패키지 오프라인 전달)**

```bash
# RHEL 계열
dnf install -y gcc make perl kernel-devel kernel-headers

# Ubuntu 계열
apt-get install -y build-essential perl linux-headers-$(uname -r)
```

**② PowerCLI로 Linux VM에 ISO 마운트**

```powershell
$linuxVMs = Get-VM | Where-Object {
    $_.Guest.OSFullName -notlike "*Windows*" -and
    $_.PowerState -eq "PoweredOn"
}

foreach ($vm in $linuxVMs) {
    ($vm | Get-View).MountToolsInstaller()
    Write-Host "ISO 마운트: $($vm.Name)"
    Start-Sleep -Seconds 2
}
```

**③ Linux 게스트 내부 ISO 설치**

```bash
# ISO 마운트
mkdir -p /mnt/cdrom
mount /dev/cdrom /mnt/cdrom 2>/dev/null || mount /dev/sr0 /mnt/cdrom

# 설치 파일 압축 해제
cp /mnt/cdrom/VMwareTools-*.tar.gz /tmp/
cd /tmp && tar -zxf VMwareTools-*.tar.gz
cd vmware-tools-distrib

# 자동 설치 (-d: 모든 항목 기본값 적용)
./vmware-install.pl -d

# 버전 확인
vmware-toolsd --version
# 출력: VMware Tools daemon, version 12.5.4.24964629

# 마운트 해제
umount /mnt/cdrom
```

**④ PowerCLI로 ISO 마운트 해제 (설치 완료 후)**

```powershell
foreach ($vm in $linuxVMs) {
    ($vm | Get-View).UnmountToolsInstaller()
    Write-Host "ISO 해제: $($vm.Name)"
}
```

> **주의**: Bundled ISO 방식은 커널 업데이트 시 VMware 커널 모듈을 재컴파일해야 합니다.
> 커널 자동 업데이트가 있는 환경에서는 DKMS 설정을 권장합니다.

---

### 8.7 방법별 비교

| 항목 | 8.3 OSP 직접 | 8.4 파일 전송 | 8.5 내부 미러 | 8.6 Bundled ISO |
|------|:------------:|:-------------:|:-------------:|:---------------:|
| 인터넷 필요 | ✅ 필요 | ❌ 불필요 | ❌ 불필요 | ❌ 불필요 |
| 버전 정확도 | OS 리포 종속 | 선택 가능 | 선택 가능 | **정확히 12.5.4** |
| 구성 복잡도 | 낮음 | 낮음 | 중간 | 중간 |
| 대규모 적용 | ✅ 용이 | ⚠️ 번거로움 | ✅ 용이 | ✅ 용이 |
| 커널 업데이트 영향 | 없음 | 없음 | 없음 | ⚠️ 재컴파일 필요 |

---

### 8.8 PowerCLI 일괄 업그레이드 스크립트

```powershell
# ============================================================
# VMware Tools Linux VM 일괄 업그레이드 스크립트
# 방식   : VMware OSP 리포지토리 경유 open-vm-tools 업그레이드
# 재부팅 : 서비스 재시작만 (커널 모듈 변경 없으면 재부팅 불필요)
# ============================================================

$guestCred = Get-Credential -Message "Linux VM root 자격증명"
$logFile   = "C:\tools-upgrade-linux-$(Get-Date -Format yyyyMMdd-HHmm).log"
$sleepSec  = 10

function Write-Log {
    param($msg)
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" |
        Tee-Object -FilePath $logFile -Append
}

# RHEL 계열 업그레이드 스크립트
$scriptRHEL = @'
# VMware OSP 리포지토리 등록 (RHEL 8 기준 — 버전에 맞게 조정)
cat > /etc/yum.repos.d/vmware-tools.repo << 'REPO'
[vmware-tools]
name=VMware Tools
baseurl=https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/
enabled=1
gpgcheck=1
gpgkey=https://packages.vmware.com/tools/keys/VMWARE-PACKAGING-GPG-RSA-KEY.pub
REPO

# 업그레이드 실행
dnf upgrade open-vm-tools -y 2>&1

# 서비스 재시작
systemctl restart vmtoolsd

# 결과 출력
echo "VERSION: $(vmware-toolsd --version)"
echo "STATUS: $(systemctl is-active vmtoolsd)"
'@

# Ubuntu 계열 업그레이드 스크립트
$scriptUbuntu = @'
# VMware OSP 리포지토리 등록 (Ubuntu 20.04 기준 — 버전에 맞게 조정)
wget -q https://packages.vmware.com/tools/keys/VMWARE-PACKAGING-GPG-RSA-KEY.pub -O- | apt-key add - 2>/dev/null
echo "deb https://packages.vmware.com/tools/esx/7.0latest/ubuntu focal main" \
    > /etc/apt/sources.list.d/vmware-tools.list

# 업그레이드 실행
apt-get update -qq 2>&1
apt-get upgrade open-vm-tools -y 2>&1

# 서비스 재시작
systemctl restart open-vm-tools 2>/dev/null || systemctl restart vmtoolsd

# 결과 출력
echo "VERSION: $(vmware-toolsd --version)"
echo "STATUS: $(systemctl is-active vmtoolsd 2>/dev/null || systemctl is-active open-vm-tools)"
'@

Write-Log "===== Linux VM open-vm-tools 업그레이드 시작 ====="

$linuxVMs = Get-VM | Where-Object {
    $_.Guest.OSFullName -notlike "*Windows*" -and
    $_.Guest.OSFullName -ne "" -and
    $_.PowerState -eq "PoweredOn"
}

Write-Log "대상 Linux VM 수: $($linuxVMs.Count)"

foreach ($vm in $linuxVMs) {
    $os = $vm.Guest.OSFullName
    Write-Log "--- 처리 시작: $($vm.Name) [$os] ---"

    # OS 계열 판별
    $isRHEL   = $os -match "Red Hat|CentOS|Rocky|AlmaLinux|Oracle"
    $isUbuntu = $os -match "Ubuntu|Debian"

    if (-not $isRHEL -and -not $isUbuntu) {
        Write-Log "[SKIP] $($vm.Name) — 지원되지 않는 OS: $os"
        continue
    }

    $script = if ($isRHEL) { $scriptRHEL } else { $scriptUbuntu }

    try {
        $result = Invoke-VMScript -VM $vm `
                    -ScriptText $script `
                    -GuestCredential $guestCred `
                    -ScriptType Bash `
                    -ErrorAction Stop

        $output = $result.ScriptOutput.Trim()
        Write-Log "[OK]   $($vm.Name)"
        Write-Log "       $($output -replace "`n", " | ")"
    } catch {
        Write-Log "[FAIL] $($vm.Name) — $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $sleepSec
}

Write-Log "===== Linux VM 업그레이드 완료 — Phase 7 검증 진행 ====="
Write-Log "로그 파일: $logFile"
```

### 8.4 SLES / openSUSE 별도 처리 (해당 VM 존재 시)

```powershell
# SLES 계열 스크립트 (Invoke-VMScript로 전달)
$scriptSLES = @'
# VMware OSP 리포지토리 등록 (SLES 15 기준)
zypper addrepo https://packages.vmware.com/tools/esx/7.0latest/sles15/x86_64/ vmware-tools
zypper --gpg-auto-import-keys refresh vmware-tools

# 업그레이드
zypper update open-vm-tools -y

# 서비스 재시작
systemctl restart vmtoolsd

echo "VERSION: $(vmware-toolsd --version)"
echo "STATUS: $(systemctl is-active vmtoolsd)"
'@
```

---

## 9. Phase 7 — Linux VM 업그레이드 결과 검증

### 9.1 PowerCLI 기반 상태 확인

```powershell
Start-Sleep -Seconds 60   # 서비스 재시작 완료 대기

$linuxResult = Get-VM |
    Where-Object { $_.Guest.OSFullName -notlike "*Windows*" -and
                   $_.Guest.OSFullName -ne "" } |
    Select-Object Name,
        @{N="OS";           E={$_.Guest.OSFullName}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object ToolsStatus

$linuxResult | Export-Csv "C:\tools-result-linux-$(Get-Date -Format yyyyMMdd-HHmm).csv" -NoTypeInformation
$linuxResult | Format-Table -AutoSize

Write-Host "`n===== Linux VM 요약 =====" -ForegroundColor Cyan
Write-Host "정상 (toolsOk)    : $(($linuxResult | Where-Object {$_.ToolsStatus -eq 'toolsOk'}).Count) 대"   -ForegroundColor Green
Write-Host "구버전 (toolsOld) : $(($linuxResult | Where-Object {$_.ToolsStatus -eq 'toolsOld'}).Count) 대"  -ForegroundColor Yellow
Write-Host "미가동            : $(($linuxResult | Where-Object {$_.ToolsStatus -eq 'toolsNotRunning'}).Count) 대" -ForegroundColor Red
```

### 9.2 게스트 내부 버전 직접 확인 (SSH)

```bash
# Linux 게스트 SSH 접속 후 실행
vmware-toolsd --version
# VMware Tools daemon, version 12.x.x.xxxxx

systemctl status vmtoolsd
# Active: active (running)

# RHEL: 설치된 패키지 버전 확인
rpm -q open-vm-tools

# Ubuntu: 설치된 패키지 버전 확인
dpkg -l open-vm-tools | grep open-vm-tools
```

### 9.3 Linux VM 검증 판단 기준

| 상태 | 판단 | 조치 |
|------|------|------|
| `toolsOk` + `guestToolsRunning` | ✅ 정상 완료 | 없음 |
| `toolsOld` + `guestToolsRunning` | ⚠️ 리포지토리 버전 제한 | OS 리포지토리 최신 버전 확인 |
| `toolsNotRunning` | ❌ 서비스 중지 | `systemctl restart vmtoolsd` |
| `toolsNotInstalled` | ❌ 미설치 | 신규 설치 필요 |

> **참고**: Linux open-vm-tools는 OS 리포지토리 제공 버전에 종속됩니다.
> vCenter에서 `toolsOld`로 표시되더라도 해당 OS에서 제공 가능한 최신 버전이면 정상입니다.

---

## 10. 트러블슈팅

### 10.1 Windows — Update-Tools 명령 실패 시

```powershell
# 개별 VM 재시도
$vm = Get-VM -Name "<VM명>"
Update-Tools -VM $vm -NoReboot -Confirm:$false

# Tools 서비스 재시작 후 재시도
Invoke-VMScript -VM $vm `
    -ScriptText "Restart-Service VMTools" `
    -GuestCredential (Get-Credential) `
    -ScriptType PowerShell
```

### 10.2 Windows — toolsOld 상태 유지 시

```powershell
$vm = Get-VM -Name "<VM명>"
$vm.ExtensionData.UpdateViewData("Guest")
$vm.Guest.ExtensionData.ToolsStatus
$vm.Guest.ToolsVersion
```

### 10.3 Linux — 리포지토리 접근 실패 시

```bash
# 프록시 경유 리포지토리 접근 (RHEL)
cat >> /etc/yum.conf << 'EOF'
proxy=http://<proxy-host>:<port>
EOF

# 리포지토리 접근 테스트
curl -sk --proxy http://<proxy>:<port> \
    https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/

# Air-gapped 환경 — 패키지 수동 다운로드 후 로컬 설치
# 외부 PC에서 다운로드:
# https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/
# rpm 파일을 datastore 경유 복사 후:
rpm -Uvh /tmp/open-vm-tools-*.rpm
```

### 10.4 Linux — vmtoolsd 서비스 시작 실패 시

```bash
# 로그 확인
journalctl -u vmtoolsd --since "10 minutes ago"

# 커널 모듈 확인
lsmod | grep vmw
modprobe vmw_vmci

# 패키지 재설치
# RHEL:
dnf reinstall open-vm-tools -y
# Ubuntu:
apt-get install --reinstall open-vm-tools -y

# 서비스 재시작
systemctl restart vmtoolsd
```

### 10.5 vLCM Remediation 실패 시

```bash
# vLCM 로그 확인 (VCSA SSH)
tail -200 /var/log/vmware/vmware-updatemgr/vum-server/vmware-vum-server.log | grep -i error

# HCL 캐시 초기화 후 재시도
rm /etc/vmware/lifecycle/vsan_hcl_cache.db
service-control --stop vmware-updatemgr
service-control --start vmware-updatemgr
```

### 10.6 vLCM 403 다운로드 오류 (온라인 Depot 사용 시)

```
vSphere Client → Menu → Lifecycle Manager → Settings → Download Sources
→ Broadcom Portal에서 새 Token 발급 후 URL 갱신:
  https://dl.broadcom.com/<TOKEN>/PROD/COMP/VMTOOLS/main/vmw-depot-index.xml
```

---

## 11. 롤백 절차

### 11.1 Windows/Linux 게스트 VM Tools 롤백 (스냅샷)

```powershell
# 위험도: HIGH — 스냅샷 이후 변경사항 모두 소실
$vm   = Get-VM -Name "<VM명>"
$snap = Get-Snapshot -VM $vm -Name "Pre-ToolsUpgrade-*" |
        Sort-Object Created -Descending | Select-Object -First 1
Set-VM -VM $vm -Snapshot $snap -Confirm:$false
```

### 11.2 Linux — open-vm-tools 이전 버전으로 다운그레이드

```bash
# RHEL: 이전 버전으로 다운그레이드
dnf downgrade open-vm-tools -y
systemctl restart vmtoolsd

# Ubuntu: 이전 버전 핀 설치
apt-get install open-vm-tools=<이전버전> -y
```

### 11.3 ESXi 호스트 Tools VIB 롤백

> **참고**: 호스트 재부팅이 수반됩니다. Maintenance Mode 진입 후 진행.

```bash
# 현재 VIB 제거
esxcli software vib remove --vibname esx-tools-light

# 이전 버전 재설치
esxcli software vib install -d /vmfs/volumes/datastore1/<이전버전-depot.zip>

# 호스트 재부팅
esxcli system shutdown reboot -r "VMware Tools VIB rollback"
```

---

## 12. 작업 체크리스트

### 사전 준비

```
□ Depot 파일 준비: VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip
□ PowerCLI 연결 테스트 완료
□ Linux VM root 자격증명 준비 완료
□ Linux VM 리포지토리 접근 테스트 완료
□ 전체 VM 스냅샷 생성 완료
□ Windows 현황 CSV 저장 완료 (tools-audit-windows-YYYYMMDD.csv)
□ Linux 현황 CSV 저장 완료 (tools-audit-linux-YYYYMMDD.csv)
□ DRS Fully Automated 확인 (Phase 2 전)
```

### Phase 2 — ESXi VIB 교체

```
□ vLCM Depot 업로드 완료
□ Baseline 생성 완료: VMware-Tools-12.5.4-24964629
□ Compliance Check 완료 (Non-Compliant 확인)
□ Remediation 완료 (전체 호스트 재부팅 완료)
□ 호스트별 VIB 버전 12.5.4 확인 완료
```

### Phase 3~5 — Windows VM

```
□ 업그레이드 스크립트 실행 완료 (tools-upgrade-windows-YYYYMMDD-HHmm.log)
□ 결과 CSV 저장 완료 (tools-result-windows-YYYYMMDD-HHmm.csv)
□ toolsOk VM 수 확인: _____ 대
□ 재부팅 필요 VM 목록 저장 완료
□ (유지보수 창) VM 재부팅 완료
□ 최종 상태 CSV 저장 완료 (tools-final-windows-YYYYMMDD-HHmm.csv)
□ 전체 Windows VM toolsOk 확인 완료
```

### Phase 6~7 — Linux VM

```
□ OSP 리포지토리 접근 테스트 완료
□ 업그레이드 스크립트 실행 완료 (tools-upgrade-linux-YYYYMMDD-HHmm.log)
□ 결과 CSV 저장 완료 (tools-result-linux-YYYYMMDD-HHmm.csv)
□ toolsOk / toolsRunning VM 수 확인: _____ 대
□ 실패 VM 원인 파악 및 수동 조치 완료
```

### 작업 종료

```
□ 전체 VM 정상 동작 확인 완료
□ 스냅샷 삭제 예약 (작업 완료 후 7일 이내)
□ 작업 결과 보고서 작성 완료
```

---

## 13. 참고

| 리소스 | 내용 | URL |
|--------|------|-----|
| KB 340 | VMware Tools 버전/빌드 매핑 | https://kb.vmware.com/s/article/340 |
| KB 2150799 | VMware Tools 호환성 매트릭스 | https://kb.vmware.com/s/article/2150799 |
| KB 2129825 | Linux open-vm-tools 지원 정보 | https://kb.vmware.com/s/article/2129825 |
| KB 390121 | vLCM 403 다운로드 오류 (Broadcom 토큰) | https://knowledge.broadcom.com/external/article/390121 |
| KB 2107796 | Quiescing 실패 시 조치 | https://kb.vmware.com/s/article/2107796 |
| VMware OSP 리포지토리 | Linux 배포판별 공식 패키지 | https://packages.vmware.com/tools/ |
| VMware Tools Docs | 공식 VMware Tools 문서 | https://docs.vmware.com/en/VMware-Tools/ |
