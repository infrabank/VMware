# VMware vSphere 보안 패치 작업 절차서

| 항목 | 내용 |
|------|------|
| **문서번호** | OPS-VMW-20260306-001 |
| **작업명** | VMware vCenter / ESXi 보안 취약점 패치 (VMSA-2025-0004 외) |
| **작업일시** | 2026년 3월 6일 (금) 18:00 ~ 21:00 (3시간) |
| **작업자** | |
| **승인자** | |
| **작성일** | 2026년 2월 12일 |

---

## 1. 작업 개요

### 1.1 작업 목적
운영 중인 VMware vSphere 환경에 대한 보안 취약점 긴급 패치 적용.

### 1.2 대상 취약점

**vCenter Server 관련:**

| VMSA | CVE | CVSS | 유형 | 실제 공격 |
|------|-----|------|------|-----------|
| VMSA-2024-0012 | CVE-2024-37079 | 9.8 | vCenter RCE (DCERPC heap-overflow) | - |
| VMSA-2024-0012 | CVE-2024-37080 | 9.8 | vCenter RCE (DCERPC heap-overflow) | - |
| VMSA-2024-0019 | CVE-2024-38812 | 9.8 | vCenter RCE (DCERPC heap-overflow) | **확인됨** |
| VMSA-2024-0019 | CVE-2024-38813 | 7.2 | vCenter 권한 상승 | **확인됨** |

**ESXi 관련:**

| VMSA | CVE | CVSS | 유형 | 실제 공격 |
|------|-----|------|------|-----------|
| VMSA-2025-0004 | CVE-2025-22224 | 9.3 | VM→호스트 코드 실행 (VMCI heap-overflow) | **확인됨** |
| VMSA-2025-0004 | CVE-2025-22225 | 8.2 | ESXi 커널 임의 쓰기 (샌드박스 탈출) | **확인됨** |
| VMSA-2025-0004 | CVE-2025-22226 | 7.1 | HGFS 정보 유출 | **확인됨** |

### 1.3 작업 범위

| 대상 | 현재 버전 | 목표 버전 |
|------|-----------|-----------|
| vCenter Server (VCSA) | 7.0 U3a (Build 18778458) | **7.0 U3t (Build 24322018)** |
| ESXi Host #1 | 7.0 U3g (Build 20328353) | **7.0 U3s (Build 24585291)** |
| ESXi Host #2 | 7.0 U3g (Build 20328353) | **7.0 U3s (Build 24585291)** |
| ESXi Host #3 | 7.0 U3g (Build 20328353) | **7.0 U3s (Build 24585291)** |

### 1.4 서비스 영향

| Phase | 영향 범위 | 예상 시간 |
|-------|-----------|-----------|
| Phase 1 (vCenter 패치) | vSphere Client 접속 불가. **VM 운영 영향 없음.** | 20~40분 |
| Phase 2 (ESXi 패치) | 호스트별 순차 리부트. VM은 vMotion으로 자동 대피. **순간 네트워크 순단 (수 초).** | 호스트당 15~20분 |

---

## 2. 사전 준비 사항

### 2.1 패치 파일 준비 (작업 D-1 이전 완료)

| # | 파일 | 용도 | 다운로드 |
|---|------|------|----------|
| 1 | `VMware-vCenter-Server-Appliance-7.0.3.02100-24322018-patch-FP.iso` | vCenter 7.0 U3t 패치 ISO | Broadcom Support Portal |
| 2 | `VMware-ESXi-7.0U3s-24585291-depot.zip` | ESXi 7.0 U3s offline bundle | Broadcom Support Portal |

- [ ] 파일 다운로드 완료
- [ ] 파일 해시(SHA256) 검증 완료
- [ ] vCenter 접근 가능한 Datastore에 업로드 완료

### 2.2 접속 정보 확인 (작업 D-1)

| 항목 | 정보 | 확인 |
|------|------|------|
| vCenter FQDN / IP | | [ ] |
| vCenter 관리자 계정 | administrator@vsphere.local | [ ] |
| VCSA root 계정 (SSH) | root | [ ] |
| VAMI 접속 URL | https://\<vcsa-ip\>:5480 | [ ] |
| ESXi Host #1 IP / 계정 | | [ ] |
| ESXi Host #2 IP / 계정 | | [ ] |
| ESXi Host #3 IP / 계정 | | [ ] |
| vCenter 백업 저장소 (FTP/NFS 등) | | [ ] |

### 2.3 사전 점검 (작업 D-1 또는 당일 17:00)

#### 2.3.1 vCenter 상태 확인

```bash
# VCSA SSH 접속
service-control --status --all
```
- [ ] 모든 서비스 RUNNING 확인

```bash
df -h
```
- [ ] /storage 파티션 여유 공간 10GB 이상 확인
- [ ] / (root) 파티션 여유 공간 확인

```bash
nslookup $(hostname -f)
nslookup <vcsa-ip>
```
- [ ] DNS 정방향 해석 정상
- [ ] DNS 역방향 해석 정상

#### 2.3.2 ESXi 호스트 상태 확인

```powershell
# PowerCLI
Connect-VIServer -Server <vcsa-ip>
Get-VMHost | Select Name, Version, Build, ConnectionState, PowerState
```
- [ ] 3호스트 모두 Connected / PoweredOn 확인

#### 2.3.3 클러스터 상태 확인

```powershell
Get-Cluster | Select Name, HAEnabled, HAAdmissionControlEnabled, DrsEnabled
```
- [ ] HA Enabled 확인
- [ ] DRS 현재 상태 기록 (미구성 확인)

#### 2.3.4 리소스 여유 확인

```powershell
Get-VMHost | Select Name,
    @{N='CPU_Used_MHz';E={($_ | Get-View).Summary.QuickStats.OverallCpuUsage}},
    @{N='CPU_Total_MHz';E={($_ | Get-View).Summary.Hardware.CpuMhz * ($_ | Get-View).Summary.Hardware.NumCpuCores}},
    @{N='Mem_Used_GB';E={[math]::Round(($_ | Get-View).Summary.QuickStats.OverallMemoryUsage/1024,1)}},
    @{N='Mem_Total_GB';E={[math]::Round(($_ | Get-View).Summary.Hardware.MemorySize/1GB,1)}}
```
- [ ] 호스트 1대 제외 시에도 VM 전체 수용 가능 확인
- [ ] CPU 사용률 기록: Host#1 ___%, Host#2 ___%, Host#3 ___%
- [ ] Memory 사용률 기록: Host#1 ___%, Host#2 ___%, Host#3 ___%

#### 2.3.5 vMotion 차단 요소 확인

```powershell
# CD/ISO 마운트 확인
Get-VM | Get-CDDrive | Where-Object {$_.IsoPath -and $_.ConnectionState.Connected} |
    Select @{N='VM';E={$_.Parent.Name}}, IsoPath

# USB Passthrough 확인
Get-VM | Get-USBDevice | Select @{N='VM';E={$_.Parent.Name}}, Name
```
- [ ] CD 마운트된 VM 목록 기록 및 분리 계획 수립
- [ ] USB Passthrough VM 목록 기록 및 처리 계획 수립

#### 2.3.6 HA Admission Control 검증

```powershell
# VM 총 리소스 요구량 vs 호스트 2대 가용량 비교
$vms = Get-VM | Where-Object {$_.PowerState -eq "PoweredOn"}
$totalCPU = ($vms | Measure-Object -Property NumCpu -Sum).Sum
$totalMemGB = [math]::Round(($vms | Measure-Object -Property MemoryGB -Sum).Sum, 1)
Write-Host "Powered-On VMs: $($vms.Count), Total vCPU: $totalCPU, Total Mem: ${totalMemGB}GB"
```
- [ ] 가동 VM 수: ___대
- [ ] 총 vCPU: ___개, 총 Memory: ___GB

---

## 3. 작업 절차

### ====================================================
### Phase 1: vCenter Server 패치 (7.0 U3a → 7.0 U3t)
### ====================================================

#### Step 1-1. vCenter 파일 백업 [18:00~18:10] ✅ SAFE

```
브라우저: https://<vcsa-ip>:5480 (VAMI)
  > 로그인 (root)
  > Backup
  > Backup Now
    - Backup Location: <사전 준비한 FTP/NFS 경로>
    - Username / Password 입력
    - ☑ Encrypt backup (선택)
  > START
  > 완료 대기 및 성공 확인
```

| 확인 | 결과 |
|------|------|
| 백업 성공 여부 | [ ] 성공 / [ ] 실패 → 실패 시 원인 확인 후 재시도 |
| 백업 파일 경로 | |
| 백업 소요 시간 | 분 |

---

#### Step 1-2. VCSA VM 스냅샷 생성 [18:10~18:15] ✅ SAFE

```
vSphere Client (또는 ESXi Host Client)
  > VCSA VM 선택
  > Actions > Snapshots > Take Snapshot
    - Name: "Pre-Patch-7.0U3t-20260306"
    - Description: "Before vCenter 7.0U3a to 7.0U3t patch"
    - ☑ Snapshot the virtual machine's memory
    - ☑ Quiesce guest file system
  > CREATE
```

| 확인 | 결과 |
|------|------|
| 스냅샷 생성 성공 | [ ] 성공 / [ ] 실패 |
| 스냅샷 이름 | Pre-Patch-7.0U3t-20260306 |

> **중요**: 이 스냅샷은 패치 실패 시 최우선 롤백 수단. 패치 완료 후 정상 확인되면 24~48시간 내 삭제 필요.

---

#### Step 1-3. 패치 ISO 마운트 [18:15~18:20] ✅ SAFE

```
vSphere Client (또는 ESXi Host Client)
  > VCSA VM 선택
  > Edit Settings
  > CD/DVD drive 1
    - ☑ Connected
    - ☑ Connect at power on
    - Datastore ISO File 선택
    - 업로드한 패치 ISO 지정:
      VMware-vCenter-Server-Appliance-7.0.3.02100-24322018-patch-FP.iso
  > OK
```

| 확인 | 결과 |
|------|------|
| ISO 마운트 완료 | [ ] 완료 |

---

#### Step 1-4. 패치 Stage & Install [18:20~19:00] ⚠️ HIGH

> **주의**: 이 단계부터 vCenter 서비스 중단. vSphere Client 접속 불가.
> VM은 영향 없음. ESXi 호스트와 VM은 정상 동작 지속.

```
브라우저: https://<vcsa-ip>:5480 (VAMI)
  > Update
  > Check Updates
    > ☑ Check CD-ROM
    > CHECK
  > 패치 감지 확인: "7.0.3.02100" 또는 유사 표시
  > Stage and Install
  > EULA 동의
  > ☑ "I have backed up vCenter Server and its associated databases"
  > FINISH
```

설치 진행 중 모니터링:
```
# VCSA SSH (별도 세션 유지)
tail -f /var/log/vmware/applmgmt/PatchRunner.log
```

| 확인 | 결과 |
|------|------|
| Stage 시작 시각 | : |
| Install 시작 시각 | : |
| 서비스 재시작 시각 | : |
| VAMI 접속 복구 시각 | : |
| 총 소요 시간 | 분 |

---

#### Step 1-5. vCenter 패치 결과 확인 [19:00~19:10] ✅ SAFE

**5-1. VAMI에서 버전 확인**
```
https://<vcsa-ip>:5480
  > Summary
  > Version 확인
```
- [ ] Version: 7.0.3.02100 (Build 24322018) 확인

**5-2. 서비스 상태 확인**
```bash
# VCSA SSH
service-control --status --all
```
- [ ] 모든 서비스 RUNNING 확인
- [ ] 실패 서비스 있으면 기록: ______________________

**5-3. vSphere Client 로그인 확인**
```
https://<vcsa-ip>/ui
  > administrator@vsphere.local 로그인
```
- [ ] 로그인 성공
- [ ] 인벤토리 정상 표시 (호스트 3대, VM 목록)

**5-4. PowerCLI 확인**
```powershell
Connect-VIServer -Server <vcsa-ip>
$global:DefaultVIServer | Select Name, Version, Build
```
- [ ] Build: 24322018 확인

**5-5. 호스트 연결 상태 확인**
```powershell
Get-VMHost | Select Name, ConnectionState
```
- [ ] 3호스트 모두 Connected

| 확인 항목 | 기대값 | 실제값 | 결과 |
|-----------|--------|--------|------|
| vCenter Build | 24322018 | | [ ] OK |
| 서비스 상태 | All RUNNING | | [ ] OK |
| Client 로그인 | 성공 | | [ ] OK |
| Host#1 상태 | Connected | | [ ] OK |
| Host#2 상태 | Connected | | [ ] OK |
| Host#3 상태 | Connected | | [ ] OK |

> **판정**: 위 항목 모두 OK → Phase 2 진행
> 하나라도 실패 → [6. 롤백 절차] 참조

---

### ====================================================
### Phase 2: ESXi 호스트 패치 (7.0 U3g → 7.0 U3s)
### ====================================================

#### Step 2-1. vLCM에 패치 Import [19:10~19:15] ✅ SAFE

```
vSphere Client
  > Menu > Lifecycle Manager
  > IMPORTED ISOs 탭 (또는 PATCHES 탭)
  > IMPORT PATCHES (하단)
  > VMware-ESXi-7.0U3s-24585291-depot.zip 업로드
  > 업로드 완료 대기
```

| 확인 | 결과 |
|------|------|
| Import 성공 | [ ] 완료 |

---

#### Step 2-2. Baseline 생성 및 Attach [19:15~19:20] ✅ SAFE

```
Lifecycle Manager > BASELINES 탭
  > NEW > Baseline
    - Name: "VMSA-2025-0004-ESXi70U3s"
    - Content Type: Patch
    - ESXi 7.0 선택 > Build 24585291 관련 패치 체크
  > CREATE
```

```
vSphere Client
  > Cluster 선택
  > Updates 탭
  > ATTACHED BASELINES > ATTACH
  > "VMSA-2025-0004-ESXi70U3s" 선택
  > ATTACH
```

| 확인 | 결과 |
|------|------|
| Baseline 생성 | [ ] 완료 |
| Cluster에 Attach | [ ] 완료 |

---

#### Step 2-3. Compliance Check [19:20~19:25] ✅ SAFE

```
Cluster > Updates 탭
  > CHECK COMPLIANCE
```

| 호스트 | Compliance 상태 | 확인 |
|--------|----------------|------|
| Host #1 | Non-Compliant | [ ] |
| Host #2 | Non-Compliant | [ ] |
| Host #3 | Non-Compliant | [ ] |

> 3호스트 모두 Non-Compliant여야 정상

---

#### Step 2-4. vMotion 차단 요소 제거 [19:25~19:30] ⚠️ MODERATE

사전 점검(2.3.5)에서 확인된 CD 마운트 / USB Passthrough VM 처리:

```powershell
# CD 마운트 전체 분리
Get-VM | Get-CDDrive | Where-Object {$_.IsoPath -and $_.ConnectionState.Connected} |
    Set-CDDrive -NoMedia -Confirm:$false
```

| 확인 | 결과 |
|------|------|
| CD 분리 완료 | [ ] 완료 / [ ] 해당 없음 |
| USB VM 처리 완료 | [ ] 완료 / [ ] 해당 없음 |

---

#### Step 2-5. DRS 임시 활성화 [19:30~19:35] ⚠️ MODERATE

> **필수**: DRS 미구성 상태에서는 vLCM Remediate 시 VM 자동 대피 불가.
> 패치 완료 후 반드시 원복(비활성화).

```
vSphere Client
  > Cluster 선택
  > Configure > vSphere DRS
  > Edit
    - vSphere DRS: Turn ON
    - Automation Level: Fully Automated
    - Migration Threshold: 기본값 (Level 3)
  > OK
```

또는 PowerCLI:
```powershell
Set-Cluster -Cluster "<클러스터명>" -DrsEnabled:$true -DrsAutomationLevel FullyAutomated -Confirm:$false
```

| 확인 | 결과 |
|------|------|
| DRS 활성화 | [ ] Fully Automated 확인 |

---

#### Step 2-6. Remediate 실행 [19:35~20:35] ⚠️ HIGH

> **주의**: 호스트별 순차 리부트 진행. VM은 DRS에 의해 자동 vMotion.
> vMotion 중 VM 네트워크 순단 수 초 발생 가능.

```
Cluster > Updates 탭
  > REMEDIATE
  > Remediation Settings:
    - ☑ Sequential remediation (순차 적용)
    - ☑ Evacuate powered off VMs to other hosts
    - ☑ Retry entering maintenance mode in case of failure
    - Maintenance Mode timeout: 3600 seconds
  > Schedule: 즉시 실행
  > REMEDIATE 시작
```

모니터링:
```
vSphere Client > Cluster > Monitor > Tasks
```

| 호스트 | 유지보수 진입 | 패치 설치 | 리부트 | 유지보수 해제 | 완료시각 |
|--------|-------------|-----------|--------|-------------|---------|
| Host #1 | [ ] | [ ] | [ ] | [ ] | : |
| Host #2 | [ ] | [ ] | [ ] | [ ] | : |
| Host #3 | [ ] | [ ] | [ ] | [ ] | : |

> 호스트당 약 15~20분 소요. 3대 총 45분~1시간 예상.

---

#### Step 2-7. ESXi 패치 결과 확인 [20:35~20:45] ✅ SAFE

**7-1. 빌드 번호 확인**
```powershell
Get-VMHost | Select Name, Version, Build, ConnectionState
```

| 호스트 | 기대 Build | 실제 Build | 상태 | 결과 |
|--------|-----------|-----------|------|------|
| Host #1 | 24585291 | | Connected | [ ] OK |
| Host #2 | 24585291 | | Connected | [ ] OK |
| Host #3 | 24585291 | | Connected | [ ] OK |

**7-2. Compliance 재확인**
```
Cluster > Updates 탭 > CHECK COMPLIANCE
```
- [ ] 3호스트 모두 Compliant 확인

**7-3. VM 상태 확인**
```powershell
Get-VM | Where-Object {$_.PowerState -eq "PoweredOn"} | Measure-Object
Get-VM | Where-Object {$_.PowerState -eq "PoweredOff"} |
    Select Name, PowerState, VMHost
```
- [ ] 가동 VM 수 = 사전 점검 기록과 동일: ___대
- [ ] 예기치 않게 꺼진 VM 없음 확인

---

### ====================================================
### Phase 3: 후속 작업
### ====================================================

#### Step 3-1. DRS 원복 (비활성화) [20:45~20:50] ⚠️ MODERATE

```powershell
Set-Cluster -Cluster "<클러스터명>" -DrsEnabled:$false -Confirm:$false
```

| 확인 | 결과 |
|------|------|
| DRS Disabled 확인 | [ ] 완료 |

> DRS 비활성화해도 현재 VM 배치는 변경되지 않음.

---

#### Step 3-2. HA 정상 동작 확인 [20:50~20:55] ✅ SAFE

```powershell
Get-Cluster | Select Name, HAEnabled, HAAdmissionControlEnabled
```
- [ ] HA Enabled 확인
- [ ] Admission Control Enabled 확인

```
vSphere Client > Cluster > Monitor > vSphere HA
```
- [ ] 모든 호스트 "Protected" 상태 확인

---

#### Step 3-3. 전체 서비스 정상 확인 [20:55~21:00] ✅ SAFE

```powershell
# 전체 호스트 상태
Get-VMHost | Select Name, ConnectionState, PowerState

# 전체 VM 상태
Get-VM | Group-Object PowerState | Select Name, Count

# 알람 확인
Get-Cluster | Get-View | Select -ExpandProperty TriggeredAlarmState |
    Select @{N='Alarm';E={$_.Alarm.Value}}, OverallStatus, Time
```

- [ ] 호스트 3대 모두 Connected
- [ ] PoweredOn VM 수 = 사전 기록과 일치
- [ ] Critical 알람 없음

---

## 4. 최종 결과 기록

| 항목 | 작업 전 | 작업 후 |
|------|---------|---------|
| vCenter Version | 7.0.3.00100 | 7.0.3.02100 |
| vCenter Build | 18778458 | 24322018 |
| ESXi Host #1 Build | 20328353 | 24585291 |
| ESXi Host #2 Build | 20328353 | 24585291 |
| ESXi Host #3 Build | 20328353 | 24585291 |
| 작업 시작 시각 | 18:00 | |
| 작업 종료 시각 | | |
| 총 소요 시간 | | |

| 대응 취약점 | 해결 여부 |
|-------------|-----------|
| CVE-2024-37079 (CVSS 9.8) | [ ] vCenter 패치로 해결 |
| CVE-2024-37080 (CVSS 9.8) | [ ] vCenter 패치로 해결 |
| CVE-2024-38812 (CVSS 9.8) | [ ] vCenter 패치로 해결 |
| CVE-2024-38813 (CVSS 7.2) | [ ] vCenter 패치로 해결 |
| CVE-2025-22224 (CVSS 9.3) | [ ] ESXi 패치로 해결 |
| CVE-2025-22225 (CVSS 8.2) | [ ] ESXi 패치로 해결 |
| CVE-2025-22226 (CVSS 7.1) | [ ] ESXi 패치로 해결 |

---

## 5. 작업 후 정리 (D+1 ~ D+2)

- [ ] VCSA 스냅샷 삭제 (정상 확인 후 24~48시간 내)
  ```
  VCSA VM > Snapshots > "Pre-Patch-7.0U3t-20260306" > Delete
  ```
  > 스냅샷 장기 보유 시 디스크 성능 저하 및 용량 증가
- [ ] CD/DVD 드라이브 ISO 분리 (VCSA VM)
- [ ] 작업 결과 보고서 작성

---

## 6. 롤백 절차

### 6.1 vCenter 패치 실패 시

#### 방법 A: 스냅샷 복원 (가장 빠름, 권장)

```
VCSA VM이 구동되는 ESXi 호스트에 직접 접속 (Host Client)
  > VCSA VM 선택
  > Actions > Snapshots > Revert to snapshot
  > "Pre-Patch-7.0U3t-20260306" 선택
  > Revert
```
- 소요 시간: 5분 이내
- 결과: 패치 전 상태로 완전 복원

#### 방법 B: 파일 백업 복원

1. 신규 VCSA를 ISO에서 배포 (Stage 1만)
2. Stage 2에서 "Restore from backup" 선택
3. Step 1-1에서 생성한 백업 경로 지정
- 소요 시간: 1~2시간
- 스냅샷 없을 때 사용

### 6.2 ESXi 패치 실패 시 (특정 호스트)

1. 해당 호스트를 유지보수 모드로 유지
2. VM은 다른 호스트에서 운영 지속
3. 원인 분석 후 재시도 또는 ESXi 재설치
   ```bash
   # 호스트 config 백업이 있는 경우
   vim-cmd hostsvc/firmware/restore_config /tmp/configBundle.tgz
   ```

### 6.3 Remediate 중 VM vMotion 실패 시

1. vLCM Remediate가 자동 중단됨
2. 실패 원인 확인:
   ```
   Cluster > Monitor > Tasks > 실패 Task 클릭
   ```
3. 일반적 원인:
   - CD/ISO 마운트된 VM → 분리 후 재시도
   - 리소스 부족 → 일부 VM 수동 종료 후 재시도
   - 네트워크 문제 → VMkernel(vMotion) 확인
4. 원인 해결 후 Remediate 재실행

---

## 7. 타임라인 요약

```
17:00       사전 점검 시작
            ├── 서비스 상태, 리소스, vMotion 차단요소 확인
17:50       사전 점검 완료
            │
18:00 ━━━━━ 작업 시작 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
            │
            ├── Phase 1: vCenter 패치
18:00       │   ├── Step 1-1. vCenter 파일 백업
18:10       │   ├── Step 1-2. VCSA 스냅샷 생성
18:15       │   ├── Step 1-3. 패치 ISO 마운트
18:20       │   ├── Step 1-4. Stage & Install 시작
            │   │       ┌──────────────────────────────┐
            │   │       │  vCenter 서비스 중단 (20~40분) │
            │   │       │  VM 운영에는 영향 없음          │
            │   │       └──────────────────────────────┘
19:00       │   └── Step 1-5. vCenter 패치 결과 확인
            │
            ├── Phase 2: ESXi 패치
19:10       │   ├── Step 2-1. vLCM 패치 Import
19:15       │   ├── Step 2-2. Baseline 생성 & Attach
19:20       │   ├── Step 2-3. Compliance Check
19:25       │   ├── Step 2-4. vMotion 차단요소 제거
19:30       │   ├── Step 2-5. DRS 임시 활성화
19:35       │   ├── Step 2-6. Remediate 실행
            │   │       ┌──────────────────────────────┐
            │   │       │  Host #1: ~20분               │
            │   │       │  Host #2: ~20분               │
            │   │       │  Host #3: ~20분               │
            │   │       │  VM vMotion 중 순간 순단       │
            │   │       └──────────────────────────────┘
20:35       │   └── Step 2-7. ESXi 패치 결과 확인
            │
            ├── Phase 3: 후속 작업
20:45       │   ├── Step 3-1. DRS 원복 (비활성화)
20:50       │   ├── Step 3-2. HA 정상 확인
20:55       │   └── Step 3-3. 전체 서비스 확인
            │
21:00 ━━━━━ 작업 완료 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. 비상 연락처

| 역할 | 담당자 | 연락처 |
|------|--------|--------|
| 작업 담당자 | | |
| 인프라 팀장 | | |
| 네트워크 담당 | | |
| 스토리지 담당 | | |
| VMware 기술지원 | Broadcom Support | |

---

| 작성 | 검토 | 승인 |
|------|------|------|
| | | |
| 일자: | 일자: | 일자: |
