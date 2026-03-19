# FSLogix 배포 후 트러블슈팅 체크리스트

> 작성일: 2026-03-19
> 환경: Horizon Instant Clone + Windows 11 + FSLogix Profile Container

---

## 문제 1: 로컬 계정 프로필이 로그오프 시 삭제됨

### 원인

- FSLogix는 **도메인 계정만** VHD 프로필 저장 대상
- Instant Clone은 로그오프 시 VM 리셋 → 로컬 프로필 소멸
- `DeleteLocalProfileWhenVHDShouldApply=1` → VHD 대상이 아닌 계정의 로컬 프로필도 삭제

### 결론

**정상 동작**. 프로필 영속성이 필요한 사용자는 반드시 도메인 계정으로 로그인해야 함.

---

## 문제 1-1: Master VM에서 Default Profile 업데이트 절차

### 문제

FSLogix 활성화 상태에서 Domain Admin으로 작업 후 로그오프하면 로컬 프로필이 삭제되어 DefProf 복사 소스가 없어짐.

### 해결: FSLogix 비활성화 후 작업

```powershell
# === Master VM 커스터마이징 워크플로우 ===

# 1. FSLogix 비활성화
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "Enabled" -Value 0
Restart-Service frxsvc

# 2. Domain Admin으로 로그인 → 커스터마이징 작업 수행
#    (바탕화면 배경, 앱 설정, 시작 메뉴, 레지스트리 등)

# 3. 로그아웃 → 다른 Admin 계정으로 로그인

# 4. DefProf 실행
DefProf.exe DOMAIN\adminuser

# 5. Default Profile 업데이트 확인
Test-Path "C:\Users\Default\NTUSER.DAT"
dir "C:\Users\Default"

# 6. 작업 계정 프로필 정리 (선택)
Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -eq "C:\Users\adminuser" } | Remove-CimInstance

# 7. FSLogix 다시 활성화
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "Enabled" -Value 1

# 8. Snapshot → Push Image
```

**핵심**: Master VM 이미지 작업 시 항상 FSLogix Enabled=0 → 작업 완료 후 Enabled=1 복원 → 스냅샷

---

## 문제 2: 로그오프 스크립트 / redirections.xml 미동작

### 테스트 순서

#### Step 1: GPO 로그오프 스크립트 실행 확인

**A. 스크립트에 디버그 로그 추가**

`logoff-cleanup.ps1` 맨 위에 다음을 추가:

```powershell
$logFile = "C:\ProgramData\FSLogix\Logs\cleanup-debug.log"
Add-Content -Path $logFile -Value "=== Script started: $env:USERNAME at $(Get-Date) ==="

# ... 기존 정리 로직 ...

Add-Content -Path $logFile -Value "=== Script completed: $(Get-Date) ==="
```

로그오프 후 확인:
```powershell
Test-Path "C:\ProgramData\FSLogix\Logs\cleanup-debug.log"
Get-Content "C:\ProgramData\FSLogix\Logs\cleanup-debug.log"
```

- 파일 없음 → 스크립트 자체가 실행 안 됨 (Step 2로)
- 파일 있음 → 스크립트 실행됐지만 삭제 실패 (Step 5로)

#### Step 2: PowerShell 실행 정책 확인

```powershell
Get-ExecutionPolicy -List
```

`Restricted`이면 `.ps1` 파일이 조용히 차단됨.

**GPO로 해결:**
```
Computer Configuration > Administrative Templates > Windows Components > Windows PowerShell
  → "Turn on Script Execution" → Enabled → "Allow all scripts"
```

#### Step 3: GPO 스크립트 호출 방식 수정

GPO에서 `.ps1`을 직접 등록하면 `cmd.exe`로 실행되어 PowerShell이 호출되지 않을 수 있음.

**수정 방법:**
```
User Configuration > Windows Settings > Scripts > Logoff

기존 (문제):
  Script Name:    logoff-cleanup.ps1

변경 (해결):
  Script Name:    %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
  Parameters:     -ExecutionPolicy Bypass -NoProfile -File "C:\Scripts\logoff-cleanup.ps1"
```

#### Step 4: 스크립트를 로컬 경로에 배치

로그오프 시점에 네트워크가 먼저 끊기면 `\\domain\NETLOGON\` 경로 접근 불가.

```powershell
# Master VM에 스크립트 로컬 복사
New-Item -Path "C:\Scripts" -ItemType Directory -Force
Copy-Item "\\domain\NETLOGON\logoff-cleanup.ps1" "C:\Scripts\logoff-cleanup.ps1"
```

GPO에서 로컬 경로로 참조:
```
Parameters: -ExecutionPolicy Bypass -NoProfile -File "C:\Scripts\logoff-cleanup.ps1"
```

#### Step 5: FSLogix VHD 언마운트 타이밍 문제

로그오프 스크립트 실행 시 이미 FSLogix VHD가 언마운트되면 `$env:USERPROFILE` 경로가 무효.

확인 방법 — cleanup-debug.log에 경로 기록 추가:
```powershell
Add-Content -Path $logFile -Value "USERPROFILE: $env:USERPROFILE"
Add-Content -Path $logFile -Value "Profile exists: $(Test-Path $env:USERPROFILE)"
```

**이 경우 로그오프 스크립트(D-3)보다 redirections.xml(D-2)이 더 안정적**.

---

### Step 6: redirections.xml 동작 확인

#### 6-1. 파일 위치 확인

redirections.xml은 반드시 **VHDLocations에 설정한 공유 경로의 루트**에 있어야 함:

```powershell
# VHDLocations 확인
$vhdPath = (Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles").VHDLocations
Write-Host "VHDLocations: $vhdPath"

# redirections.xml이 해당 경로 루트에 있는지 확인
Test-Path "$vhdPath\redirections.xml"
```

예시:
```
VHDLocations = \\fileserver\profiles$
→ redirections.xml 위치: \\fileserver\profiles$\redirections.xml   (O 정상)
→ redirections.xml 위치: \\fileserver\profiles$\user1\redirections.xml  (X 인식 안됨)
```

#### 6-2. FSLogix 로그에서 redirections 처리 확인

```powershell
Select-String -Path "C:\ProgramData\FSLogix\Logs\Profile*.log" -Pattern "redirect" -Context 3
```

- `Processing redirections.xml` → 정상 인식
- redirect 관련 로그 없음 → 파일 위치 문제 또는 파일명 오타

#### 6-3. redirections.xml 문법 확인

```powershell
# XML 파싱 테스트
[xml]$xml = Get-Content "\\fileserver\profiles$\redirections.xml"
$xml.FrxProfileFolderRedirection.Exclude | Format-Table
```

에러 발생 시 XML 문법 오류 (인코딩, 태그 닫힘 등 확인).

#### 6-4. 활성 세션에서 redirect 동작 확인

```powershell
# 로그인 상태에서 실행
frx list-redirects
```

Exclude 항목이 표시되면 redirections.xml이 정상 적용된 것.

---

## 진단 결과별 조치 요약

| 진단 결과 | 원인 | 조치 |
|-----------|------|------|
| cleanup-debug.log 파일 없음 | 스크립트 미실행 | Step 2, 3, 4 순서대로 적용 |
| cleanup-debug.log 있지만 삭제 안됨 | VHD 언마운트 타이밍 | redirections.xml(D-2) 방식으로 전환 |
| redirect 로그 없음 | redirections.xml 위치 오류 | 공유 루트에 파일 배치 |
| redirect 로그에 에러 | XML 문법 오류 | XML 파싱 테스트 후 수정 |
| frx list-redirects 에 항목 없음 | redirections.xml 미인식 | 파일명, 경로, 인코딩 확인 |

---

## 참고: 최종 권장 구성

로그오프 스크립트(D-3)는 타이밍 이슈로 불안정할 수 있으므로, **redirections.xml(D-2) 방식을 우선 적용**하고 스크립트는 보조 수단으로 사용.

```
우선순위:
1. redirections.xml 정상 동작 확인 → 이것만으로 충분
2. 부족한 경우에만 로그오프 스크립트 보조 추가
```
