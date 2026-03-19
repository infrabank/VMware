# VMware Horizon VDI Troubleshooting Guide

> VMware Horizon 데스크톱 가상화(VDI) 환경 — Instant Clone, AppX provisioning, FSLogix, Windows 11 Guest OS 최적화 관련 트러블슈팅 가이드.
>
> VMware Horizon Virtual Desktop Infrastructure (VDI) — troubleshooting guide for Instant Clone, AppX provisioning, FSLogix profile management, and Windows 11 Guest OS optimization.

---

## Table of Contents

1. [Windows 11 Instant Clone "Updating Store App" Issue](#1-windows-11-instant-clone-updating-store-app-issue)
2. [Windows 10 vs Windows 11 AppX Architecture Differences](#2-windows-10-vs-windows-11-appx-architecture-differences)
3. [Solution A: Master Image AppX Optimization (Without FSLogix)](#3-solution-a-master-image-appx-optimization-without-fslogix)
4. [Solution B: FSLogix Profile Container](#4-solution-b-fslogix-profile-container)
5. [Solution C: Hybrid Approach (Recommended)](#5-solution-c-hybrid-approach-recommended)
6. [Solution D: FSLogix with User Data Reset (Selective Persistence)](#6-solution-d-fslogix-with-user-data-reset-selective-persistence)
7. [Master VM Default Profile Update Procedure](#7-master-vm-default-profile-update-procedure)
8. [Logoff Script / redirections.xml Not Working — Troubleshooting](#8-logoff-script--redirectionsxml-not-working--troubleshooting)
9. [Horizon Instant Clone Optimization Checklist](#9-horizon-instant-clone-optimization-checklist)
10. [Diagnostic Commands](#10-diagnostic-commands)
11. [Log File Locations](#11-log-file-locations)
12. [References](#12-references)

---

## 1. Windows 11 Instant Clone "Updating Store App" Issue

### Symptoms / 증상

- 사용자 로그인 시마다 **"Updating Store App XX of 108..."** 메시지 표시
- 로그인 소요 시간 60~180초 이상 지연
- 비영구(Non-persistent) Instant Clone 환경에서 매 로그인 반복
- AppxProvisionedPackage 제거, GPO 적용, First Logon Animation 비활성화 후에도 지속

- "Updating Store App XX of 108..." message appears at every user login
- Login time delayed by 60-180+ seconds
- Repeats every login in Non-persistent Instant Clone environments
- Persists even after removing AppxProvisionedPackage, applying GPOs, disabling First Logon Animation

### Root Cause / 근본 원인

Windows 11의 `AppXDeploymentServer` 서비스는 로그인 시 모든 Provisioned AppX Package를 사용자 프로필에 등록합니다. Instant Clone은 매 로그인마다 새로운 사용자 프로필을 생성하므로, 이 등록 과정이 매번 반복됩니다.

The `AppXDeploymentServer` service in Windows 11 registers all Provisioned AppX Packages to the user profile at login. Since Instant Clone creates a fresh user profile every login, this registration repeats every time.

**Key factors:**
- Windows 11 ships with ~80-108 provisioned AppX packages (vs ~30-40 in Windows 10)
- Windows 11 displays an explicit "Updating Store App" progress UI (Windows 10 processes silently)
- Core OS features (Settings, Start Menu, Widgets, Snap Layouts) depend on AppX packages
- Disabling First Logon Animation does NOT disable the AppX registration itself in Windows 11

### Impact / 영향

| Impact Area | Description |
|-------------|-------------|
| Login Time | 60-180+ seconds delay per login |
| User Experience | Unavoidable wait screen every login |
| Productivity | Multiplied across all users and sessions |
| VDI Perception | Users perceive VDI as "slow" compared to physical PCs |

---

## 2. Windows 10 vs Windows 11 AppX Architecture Differences

### Comparison Table / 비교표

| Feature | Windows 10 | Windows 11 |
|---------|-----------|-----------|
| Provisioned AppX Packages | ~30-40 | **~80-108** |
| Per-User Registration UI | Background (invisible) | **"Updating Store App" explicit UI** |
| OS Core AppX Dependency | Low (Start Menu separate) | **High** (Settings, Start Menu, Widgets all AppX) |
| Registration Time | 10-30 seconds (imperceptible) | **60-180+ seconds (noticeable)** |
| Safe to Remove Most AppX | Yes (minimal side effects) | **Partial** (removing some breaks OS features) |
| First Logon Animation Disable Effect | Also suppresses AppX UI | **Does NOT suppress AppX registration** |
| AppX re-registration trigger | New user profile only | New user profile + Windows Update + Feature update |

### Why Windows 10 Does Not Exhibit This Problem / Windows 10에서 문제가 없는 이유

1. **Package Count**: Win10 has 30-40 packages vs Win11's 80-108 → 3x longer registration
2. **UI Visibility**: Win10 processes AppX registration in the background without showing progress UI
3. **OS Dependency**: Win10's Start Menu and Settings are less dependent on AppX → safer to remove
4. **First Logon Animation**: Disabling it in Win10 effectively hides the registration; in Win11 the registration still shows
5. **Registration Speed**: Win11 AppX packages are larger and more complex, requiring more registration time per package

---

## 3. Solution A: Master Image AppX Optimization (Without FSLogix)

> This approach removes provisioned AppX packages from the master/parent image so there is nothing to register at user login. Effective when done thoroughly.
>
> Master/Parent 이미지에서 Provisioned AppX 패키지를 제거하여 로그인 시 등록할 항목 자체를 없애는 방법입니다.

### Step 1: VMware OS Optimization Tool (OSOT)

```powershell
# Download VMware OS Optimization Tool (OSOT)
# https://flings.vmware.com/vmware-os-optimization-tool
# Run on master image → Select Windows 11 template → Generalize → Optimize
```

OSOT handles many optimizations automatically including:
- Service disabling
- Scheduled task removal
- Visual effect optimization
- Telemetry reduction

### Step 2: Remove Provisioned Packages (Critical Step)

```powershell
# List current provisioned packages
Get-AppxProvisionedPackage -Online | Select-Object DisplayName, PackageName | Sort-Object DisplayName

# Define packages to KEEP (removing these breaks critical OS functions)
$keepList = @(
    'Microsoft.DesktopAppInstaller',    # winget dependency
    'Microsoft.VCLibs*',                # Visual C++ Runtime (framework)
    'Microsoft.UI.Xaml*',               # XAML Framework (framework)
    'Microsoft.WindowsStore'            # Store itself (irrecoverable if removed)
)

# Remove all non-essential provisioned packages
$packages = Get-AppxProvisionedPackage -Online
$removed = 0
foreach ($pkg in $packages) {
    $keep = $false
    foreach ($pattern in $keepList) {
        if ($pkg.DisplayName -like $pattern) { $keep = $true; break }
    }
    if (-not $keep) {
        Write-Host "Removing: $($pkg.DisplayName)"
        Remove-AppxProvisionedPackage -Online -PackageName $pkg.PackageName -ErrorAction SilentlyContinue
        $removed++
    }
}
Write-Host "Removed $removed packages."

# Verify: should be 5 or fewer remaining
Get-AppxProvisionedPackage -Online | Measure-Object
```

### Step 3: Remove Existing User Packages

```powershell
# Remove AppxPackage for all users (excluding system/framework apps)
Get-AppxPackage -AllUsers |
    Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -ne 'System' } |
    Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
```

### Step 4: Disable AppX-Related Services

```powershell
$services = @(
    'AppXSvc',          # AppX Deployment Service
    'ClipSVC',          # Client License Service
    'InstallService',   # Microsoft Store Install Service
    'WpnService',       # Windows Push Notifications System Service
    'WpnUserService'    # Windows Push Notifications User Service
)
foreach ($svc in $services) {
    Set-Service -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
}
```

> **Warning**: Disabling `AppXSvc` prevents ALL AppX operations including Windows Store. Only do this if AppX packages have been thoroughly removed and no UWP apps are needed.

### Step 5: Registry Hardening

```powershell
# Content Delivery Manager - disable consumer features / auto-app-install
$cdmPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent"
New-Item -Path $cdmPath -Force | Out-Null
Set-ItemProperty -Path $cdmPath -Name "DisableWindowsConsumerFeatures" -Value 1
Set-ItemProperty -Path $cdmPath -Name "DisableConsumerAccountStateContent" -Value 1
Set-ItemProperty -Path $cdmPath -Name "DisableCloudOptimizedContent" -Value 1

# Store auto-update disable
$storePath = "HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore"
New-Item -Path $storePath -Force | Out-Null
Set-ItemProperty -Path $storePath -Name "AutoDownload" -Value 2
Set-ItemProperty -Path $storePath -Name "DisableStoreApps" -Value 1

# AppX deployment policy - disable per-user registration in special profiles
$appxPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Appx"
New-Item -Path $appxPath -Force | Out-Null
Set-ItemProperty -Path $appxPath -Name "AllowDeploymentInSpecialProfiles" -Value 0

# First Logon Animation disable
$logonPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
Set-ItemProperty -Path $logonPath -Name "EnableFirstLogonAnimation" -Value 0
```

### Step 6: Disable Scheduled Tasks

```powershell
$tasks = @(
    "\Microsoft\Windows\AppxDeploymentClient\Pre-staged app cleanup",
    "\Microsoft\Windows\InstallService\ScanForUpdates",
    "\Microsoft\Windows\InstallService\ScanForUpdatesAsUser",
    "\Microsoft\Windows\InstallService\SmartRetry",
    "\Microsoft\Windows\WindowsUpdate\Scheduled Start"
)
foreach ($task in $tasks) {
    Disable-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
}
```

### Step 7: GPO Verification

```
Computer Configuration > Administrative Templates > Windows Components:

  Store:
    - Turn off Automatic Download and Install of Updates → Enabled
    - Disable all apps from Microsoft Store → Enabled
    - Turn off the Store application → Enabled

  Cloud Content:
    - Turn off Microsoft consumer experiences → Enabled
    - Turn off cloud consumer account state content → Enabled
    - Turn off cloud optimized content → Enabled

  App Package Deployment:
    - Allow deployment in special profiles → Disabled
```

### Validation

```powershell
# Verify remaining provisioned packages (target: 5 or fewer)
$remaining = Get-AppxProvisionedPackage -Online
Write-Host "Remaining provisioned packages: $($remaining.Count)"
$remaining | Select-Object DisplayName

# Verify services are disabled
Get-Service AppXSvc, ClipSVC, InstallService | Select-Object Name, Status, StartType
```

---

## 4. Solution B: FSLogix Profile Container

> Industry standard solution for profile persistence in non-persistent VDI. AppX registration occurs once and persists in the VHD(x) profile container.
>
> 비영구 VDI 환경에서 프로필 지속성을 확보하는 업계 표준 솔루션. AppX 등록이 1회만 수행되며 VHD(x) 프로필 컨테이너에 보존됩니다.

### How FSLogix Solves the AppX Problem

1. User logs in → FSLogix mounts VHD(x) containing previous profile
2. AppX packages already registered in the profile → **no re-registration needed**
3. "Updating Store App" message eliminated from second login onwards
4. First login still triggers registration (one-time cost)

### Architecture

```
[Instant Clone VMs] ──SMB 3.0──> [File Server VM] ──> \\fileserver\profiles$
                                                        ├── user1\Profile_user1.vhdx
                                                        ├── user2\Profile_user2.vhdx
                                                        └── ...
```

| Component | Recommended | Alternative |
|-----------|-------------|-------------|
| Storage Server | Dedicated Windows File Server VM | AD VM with File Server role |
| Protocol | SMB 3.0+ | SMB 3.0+ |
| VHD Size | 30GB (dynamic) | Adjust per use case |
| Storage for 10 users | Up to 300GB | - |
| High Availability | DFS Replication or Clustered File Server | Single server (lab only) |

### Installation

```powershell
# 1. Download FSLogix (free with Microsoft 365 / RDS CAL / VDA license)
# https://aka.ms/fslogix-latest

# 2. Install FSLogix Agent on master image (silent)
fslogixappssetup.exe /install /quiet /norestart
```

### Configuration

```powershell
# FSLogix Profile Container registry settings
$fslogixPath = "HKLM:\SOFTWARE\FSLogix\Profiles"
New-Item -Path $fslogixPath -Force | Out-Null

# Core settings
Set-ItemProperty -Path $fslogixPath -Name "Enabled" -Value 1
Set-ItemProperty -Path $fslogixPath -Name "VHDLocations" -Value "\\fileserver\profiles$"
Set-ItemProperty -Path $fslogixPath -Name "SizeInMBs" -Value 30000
Set-ItemProperty -Path $fslogixPath -Name "IsDynamic" -Value 1
Set-ItemProperty -Path $fslogixPath -Name "VolumeType" -Value "VHDX"

# Profile behavior
Set-ItemProperty -Path $fslogixPath -Name "FlipFlopProfileDirectoryName" -Value 1
Set-ItemProperty -Path $fslogixPath -Name "DeleteLocalProfileWhenVHDShouldApply" -Value 1
Set-ItemProperty -Path $fslogixPath -Name "PreventLoginWithFailure" -Value 0
Set-ItemProperty -Path $fslogixPath -Name "PreventLoginWithTempProfile" -Value 1

# Logging (for troubleshooting)
Set-ItemProperty -Path $fslogixPath -Name "LoggingEnabled" -Value 1
```

### SMB Share Permissions

```powershell
# Create SMB share for profiles
New-SmbShare -Name "profiles$" -Path "D:\Profiles" -FullAccess "Administrators" -ChangeAccess "Domain Users"

# NTFS permissions
# Administrators: Full Control (This folder, subfolders, files)
# Domain Users: Modify (This folder only)
# CREATOR OWNER: Full Control (Subfolders and files only)
```

### Horizon Instant Clone Considerations

| Setting | Recommended Value | Reason |
|---------|-------------------|--------|
| Profile Type | Profile Container (not ODFC) | Full profile capture including AppX |
| `DeleteLocalProfileWhenVHDShouldApply` | 1 | Prevent conflicts with instant clone base profile |
| `PreventLoginWithTempProfile` | 1 | Avoid temp profile issues in non-persistent |
| `PreventLoginWithFailure` | 0 | Allow login even if profile fails (graceful degradation) |
| `FlipFlopProfileDirectoryName` | 1 | Compatibility with Horizon profile path expectations |
| Antivirus Exclusions | `%ProgramFiles%\FSLogix\*`, `*.vhd`, `*.vhdx` | Prevent AV from locking VHD files |
| Network Bandwidth | ~50MB per user initial, minimal ongoing | VHD differential sync |
| Storage IOPS | ~20-50 IOPS per concurrent user | SMB metadata + VHD I/O |

### Operational Risks

| Risk | Mitigation |
|------|------------|
| SMB server failure → no profile | Set `PreventLoginWithFailure=0` for graceful degradation |
| VHD corruption | Regular backup of profile share; FSLogix built-in VHD compaction |
| Storage capacity growth | Monitor share usage; configure VHD compaction schedule |
| Profile bloat over time | Implement redirections.xml for temp/cache exclusions |
| Concurrent access conflicts | FSLogix handles locking natively; ensure single-session only |

### FSLogix Profile Not Saving to Share — Troubleshooting / 프로필이 공유폴더에 저장되지 않는 경우

#### Symptom / 증상

- FSLogix 설치 및 설정 후 공유폴더에 프로필 VHD가 생성되지 않음
- 로그오프 시 로컬 프로필이 삭제됨 (VHDLocations 미설정 + `DeleteLocalProfileWhenVHDShouldApply=1` 인 경우)
- `\\fileserver\profiles$` 에 사용자 폴더가 없음

#### Quick Diagnosis Sequence / 빠른 진단 순서

```
1. FSLogix 로그 확인       → 에러 메시지로 원인 즉시 파악
2. Enabled=1 확인          → 비활성이면 활성화
3. frxsvc 서비스 확인      → 중지되어 있으면 시작
4. 공유폴더 접근 테스트     → 경로/네트워크 문제
5. SMB/NTFS 권한 확인      → Change 이상 필요
6. 제외 그룹 확인           → 관리자 계정으로 테스트 중인가?
```

#### Step 1: Check FSLogix Logs (Most Important)

```powershell
# FSLogix Profile log — error cause is almost always here
Get-Content "C:\ProgramData\FSLogix\Logs\Profile*.log" -Tail 100
```

**Key log messages and their meanings:**

| Log Message | Cause | Fix |
|-------------|-------|-----|
| `Error locating profile VHD` | VHDLocations path unreachable | Check share path, DNS, network |
| `STATUS_ACCESS_DENIED` | Insufficient SMB/NTFS permissions | Grant Change permission to user |
| `The network path was not found` | Share path wrong or network issue | Verify UNC path, test `Test-Path` |
| `Profile not enabled` | Enabled = 0 | Set Enabled = 1 |
| `User is a member of the exclude list` | User in FSLogix exclude group | Remove from exclude group or test with normal user |
| `LoadProfile failed` | VHD create/mount failure | Check disk space, AV exclusions |

#### Step 2: Verify FSLogix Configuration

```powershell
$cfg = Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles" -ErrorAction SilentlyContinue
Write-Host "Enabled:        $($cfg.Enabled)"           # Must be 1
Write-Host "VHDLocations:   $($cfg.VHDLocations)"      # Must be UNC path (not drive letter)
Write-Host "VolumeType:     $($cfg.VolumeType)"         # VHDX recommended
Write-Host "SizeInMBs:      $($cfg.SizeInMBs)"          # e.g. 30000
Write-Host "DeleteLocal:    $($cfg.DeleteLocalProfileWhenVHDShouldApply)"
```

> **Common mistake**: `VHDLocations` must be a **UNC path** (`\\server\share$`), not a mapped drive letter.

#### Step 3: Verify FSLogix Service

```powershell
Get-Service frxsvc, frxccds | Select-Object Name, Status, StartType

# If stopped, start it
Start-Service frxsvc
Set-Service frxsvc -StartupType Automatic
```

#### Step 4: Test Share Access from VM

```powershell
# Access test
Test-Path "\\fileserver\profiles$"

# Write test (FSLogix needs to CREATE VHD files)
New-Item -Path "\\fileserver\profiles$\test.txt" -ItemType File -Force
Remove-Item "\\fileserver\profiles$\test.txt"

# If UNC fails, test with IP directly
Test-Path "\\192.168.x.x\profiles$"

# DNS resolution
Resolve-DnsName fileserver
```

**If access fails:** check SMB port 445 firewall, share is enabled on file server, DNS resolution works.

#### Step 5: Verify SMB and NTFS Permissions (on File Server)

```powershell
# Check current SMB share permissions (run on file server)
Get-SmbShareAccess -Name "profiles$"
```

**Required permissions:**

| Target | SMB Share Permission | NTFS Permission |
|--------|:---:|:---:|
| Domain Users (or VDI user group) | **Change** | Modify (This folder only) |
| Administrators | Full Control | Full Control |
| CREATOR OWNER | — | Full Control (Subfolders and files only) |

```powershell
# Fix SMB share permissions (on file server)
Grant-SmbShareAccess -Name "profiles$" -AccountName "Domain Users" -AccessRight Change -Force

# Fix NTFS permissions (on file server)
$path = "D:\Profiles"
$acl = Get-Acl $path

# Domain Users: Modify (This folder only)
$rule1 = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "Domain Users", "Modify", "None", "None", "Allow")
$acl.AddAccessRule($rule1)

# CREATOR OWNER: Full Control (Subfolders and files only)
$rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "CREATOR OWNER", "FullControl", "ContainerInherit,ObjectInherit", "InheritOnly", "Allow")
$acl.AddAccessRule($rule2)

Set-Acl $path $acl
```

> **Most common mistake**: SMB share set to `Everyone: Read` only. FSLogix must **create** VHD files, so **Change** or higher is required.

#### Step 6: Check Exclude Groups (Very Common Cause)

FSLogix **excludes local Administrators by default**. If testing with an admin account, profiles will NOT be created.

```powershell
# Check FSLogix exclude groups
Get-LocalGroupMember -Group "FSLogix Profile Exclude List" -ErrorAction SilentlyContinue
Get-LocalGroupMember -Group "FSLogix ODFC Exclude List" -ErrorAction SilentlyContinue
```

**If testing with an administrator account:**
```powershell
# Temporarily remove admin exclusion for testing
Remove-LocalGroupMember -Group "FSLogix Profile Exclude List" -Member "Administrators" -ErrorAction SilentlyContinue
```

> **Recommendation**: Always test with a **normal domain user account**, not an administrator.

#### Step 7: VHDLocations Not Set — Profile Deletion Issue

If FSLogix is installed with `Enabled=1` but `VHDLocations` is not configured:

```
Login  → FSLogix tries to mount VHD → no VHDLocations → mount fails
       → Falls back to local/temp profile
Logoff → DeleteLocalProfileWhenVHDShouldApply=1 → local profile DELETED
       → Profile data LOST (not saved to VHD either)
```

**Immediate fix:**
```powershell
# Option A: Disable FSLogix until share is ready
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "Enabled" -Value 0

# Option B: Prevent local profile deletion
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "DeleteLocalProfileWhenVHDShouldApply" -Value 0
```

**Correct setup order:**
```
1. Install FSLogix (set Enabled=0)
2. Configure VHDLocations (UNC share path)
3. Verify SMB share access and permissions
4. Set Enabled=1 (activate last)
```

#### Verification: Successful Profile Creation

When working correctly, the share folder should contain:
```
\\fileserver\profiles$\
  └── <username>_S-1-5-21-xxxxx\
       └── Profile_<username>.vhdx    ← This file must exist
```

During an active user session:
```powershell
# Verify VHD is mounted
Get-Volume | Where-Object { $_.FileSystemLabel -like "*Profile*" }

# Verify FSLogix redirects
frx list-redirects
```

---

## 5. Solution C: Hybrid Approach (Recommended)

> Combine AppX removal from master image (Solution A) with FSLogix (Solution B) for optimal results.
>
> Master 이미지에서 AppX 제거(Solution A)와 FSLogix(Solution B)를 병행하는 최적 접근법입니다.

### Benefits of Hybrid

| Benefit | Explanation |
|---------|-------------|
| Minimal first-login time | Fewer AppX packages → faster initial registration |
| No repeat registration | FSLogix preserves completed registration |
| Smaller VHD size | Fewer AppX packages → smaller profile VHD |
| Full profile persistence | User settings, browser data, personalization preserved |
| Resilient to updates | Even if AppX changes, FSLogix absorbs the one-time cost |

### Implementation Order

1. Apply Solution A (AppX optimization) to master image
2. Install FSLogix on master image
3. Configure FSLogix registry settings
4. Seal master image
5. Deploy Instant Clones
6. First user login: minimal AppX registration (5-10 seconds)
7. Subsequent logins: instant (0 seconds AppX delay)

---

## 6. Solution D: FSLogix with User Data Reset (Selective Persistence)

> When you need to prevent AppX re-registration BUT also keep user data in a clean/initialized state every login. FSLogix preserves only AppX state while user data resets.
>
> AppX 재등록은 방지하면서 사용자 데이터는 매 로그인마다 초기화 상태로 유지해야 하는 경우의 솔루션입니다.

### The Contradiction

| Requirement | Instant Clone (no FSLogix) | FSLogix (full profile) |
|-------------|---------------------------|------------------------|
| AppX re-registration prevented | X (repeats every login) | O (persisted in VHD) |
| User data reset every login | O (automatic) | X (persisted in VHD) |

These two requirements conflict. The solutions below resolve this.

### Approach Comparison

| Approach | FSLogix Required | File Server Required | Complexity | Recommendation |
|----------|:---:|:---:|:---:|:---:|
| **D-1**: No FSLogix, thorough AppX removal | No | No | Low | Best if AppX removal resolves the issue |
| **D-2**: FSLogix + redirections.xml | Yes | Yes | Medium | Best if AppX removal alone is insufficient |
| **D-3**: FSLogix + logoff cleanup script | Yes | Yes | Medium | Alternative to D-2 |

### Approach D-1: No FSLogix, Thorough AppX Removal (Simplest)

If user data reset is the top priority, **do not use FSLogix**. Instead, perform Solution A thoroughly.

- Instant Clone itself guarantees data reset every login
- No additional infrastructure needed (no file server, no FSLogix agent)
- Refer to [Solution A](#3-solution-a-master-image-appx-optimization-without-fslogix) for full procedure
- **Validation target**: `Get-AppxProvisionedPackage -Online | Measure-Object` should return 5 or fewer

> This is the recommended first attempt. Only proceed to D-2/D-3 if AppX removal alone does not eliminate the "Updating Store App" message.

### Approach D-2: FSLogix + redirections.xml (Selective Persistence)

FSLogix Profile Container에서 **AppX 상태만 보존**하고 사용자 데이터 폴더는 VHD에서 제외합니다.

#### How It Works

1. FSLogix mounts VHD at login → AppX registration data is already present
2. `redirections.xml` excludes user data folders from VHD
3. Excluded folders fall through to the Instant Clone local profile (empty/default)
4. Result: AppX = persisted, User data = fresh every login

#### redirections.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FrxProfileFolderRedirection ExcludeCommonFolders="0">

  <!-- === User Data: EXCLUDE from VHD (reset every login) === -->
  <Exclude Copy="0">Desktop</Exclude>
  <Exclude Copy="0">Documents</Exclude>
  <Exclude Copy="0">Downloads</Exclude>
  <Exclude Copy="0">Music</Exclude>
  <Exclude Copy="0">Pictures</Exclude>
  <Exclude Copy="0">Videos</Exclude>
  <Exclude Copy="0">Favorites</Exclude>
  <Exclude Copy="0">Contacts</Exclude>
  <Exclude Copy="0">Searches</Exclude>
  <Exclude Copy="0">Links</Exclude>

  <!-- Browser cache/data: EXCLUDE -->
  <Exclude Copy="0">AppData\Local\Google</Exclude>
  <Exclude Copy="0">AppData\Local\Microsoft\Edge</Exclude>
  <Exclude Copy="0">AppData\Local\Mozilla</Exclude>

  <!-- Temp/cache: EXCLUDE -->
  <Exclude Copy="0">AppData\Local\Temp</Exclude>
  <Exclude Copy="0">AppData\Local\Microsoft\Windows\INetCache</Exclude>
  <Exclude Copy="0">AppData\Local\Microsoft\Windows\Explorer</Exclude>

  <!-- OneDrive cache: EXCLUDE -->
  <Exclude Copy="0">AppData\Local\Microsoft\OneDrive</Exclude>

  <!-- === AppX Registration Data: INCLUDED in VHD (auto, do NOT exclude) === -->
  <!-- AppData\Local\Packages\              → AppX per-user data -->
  <!-- AppData\Local\Microsoft\WindowsApps\ → AppX execution aliases -->
  <!-- NTUSER.DAT registry hive             → HKCU AppModel keys -->

</FrxProfileFolderRedirection>
```

#### Deployment

```powershell
# Place redirections.xml at the root of the FSLogix profile share
# FSLogix reads it automatically when mounting the VHD
Copy-Item "C:\Admin\redirections.xml" "\\fileserver\profiles$\redirections.xml"

# Verify FSLogix picks it up (check log after user login)
# Look for "Processing redirections.xml" in:
Get-Content "C:\ProgramData\FSLogix\Logs\Profile*.log" -Tail 30 | Select-String "redirect"
```

#### Result

| Item | Behavior |
|------|----------|
| AppX registration state | Persisted in VHD → no re-registration |
| Start Menu layout | Persisted in VHD |
| Desktop / Documents / Downloads | Reset every login (empty) |
| Browser data (Edge/Chrome) | Reset every login |
| Temp / cache files | Reset every login |
| VHD size per user | ~1-3 GB (minimal, AppX state only) |

### Approach D-3: FSLogix + Logoff Cleanup Script

Alternative approach: keep full FSLogix profile but clean user data at logoff via GPO script.

#### Logoff Script

```powershell
# logoff-cleanup.ps1
# Deploy via GPO: User Configuration > Windows Settings > Scripts > Logoff

$userProfile = $env:USERPROFILE
$cleanTargets = @(
    "$userProfile\Desktop\*",
    "$userProfile\Documents\*",
    "$userProfile\Downloads\*",
    "$userProfile\Pictures\*",
    "$userProfile\Videos\*",
    "$userProfile\Music\*",
    "$userProfile\Favorites\*",
    "$userProfile\AppData\Local\Google\*",
    "$userProfile\AppData\Local\Microsoft\Edge\User Data\*",
    "$userProfile\AppData\Local\Mozilla\*",
    "$userProfile\AppData\Local\Temp\*"
)

foreach ($target in $cleanTargets) {
    Remove-Item -Path $target -Recurse -Force -ErrorAction SilentlyContinue
}

# Log cleanup event
$logMsg = "FSLogix logoff cleanup completed for $env:USERNAME at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Content -Path "C:\ProgramData\FSLogix\Logs\cleanup.log" -Value $logMsg
```

#### GPO Deployment

```
User Configuration > Windows Settings > Scripts (Logon/Logoff)
  → Logoff > Add > logoff-cleanup.ps1
```

#### D-2 vs D-3 Comparison

| Aspect | D-2 (redirections.xml) | D-3 (Logoff script) |
|--------|----------------------|---------------------|
| Mechanism | Folders never enter VHD | Folders enter VHD, deleted at logoff |
| VHD size | Small (~1-3 GB) | Can grow over session, shrinks at logoff |
| Reliability | High (declarative) | Medium (script must execute successfully) |
| Edge cases | Clean; data never persisted | Risk: if logoff script fails, data persists |
| Maintenance | Update XML file | Update PowerShell script |
| **Recommendation** | **Preferred** | Fallback if redirections.xml insufficient |

### Decision Flowchart

```
Q: "Updating Store App" message 제거가 필요한가?
├── No  → Instant Clone 기본 사용 (변경 불필요)
└── Yes
    Q: 사용자 데이터 초기화 유지가 필요한가?
    ├── No  → Solution C (Hybrid: AppX removal + FSLogix full profile)
    └── Yes
        Q: Master Image에서 AppX 철저 제거로 해결되는가?
        ├── Yes → Approach D-1 (FSLogix 불필요, 가장 단순)
        └── No  → Approach D-2 (FSLogix + redirections.xml)
                   └── D-2로 부족 시 → D-3 (Logoff script) 보조
```

---

## 7. Master VM Default Profile Update Procedure

> Master VM에서 Default Profile을 업데이트할 때, FSLogix가 활성화되어 있으면 로그오프 시 프로필이 삭제되어 DefProf 복사 소스가 사라집니다. 반드시 FSLogix를 비활성화한 상태에서 작업해야 합니다.
>
> When updating the Default Profile on a Master VM with FSLogix enabled, the admin profile is deleted on logoff (due to `DeleteLocalProfileWhenVHDShouldApply=1`), leaving no source for DefProf. FSLogix must be disabled during this procedure.

### The Problem / 문제

```
FSLogix Enabled=1 상태에서:
  Domain Admin 로그인 → 커스터마이징 작업 → 로그오프
  → FSLogix VHD 언마운트 → DeleteLocalProfileWhenVHDShouldApply=1
  → 로컬 프로필 삭제됨 → DefProf 복사 소스 없음
```

### Procedure / 절차

```powershell
# === Step 1: FSLogix 비활성화 (Master VM에서) ===
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "Enabled" -Value 0
Restart-Service frxsvc

# === Step 2: 작업 계정으로 로그인 → 커스터마이징 → 로그아웃 ===
# (FSLogix 비활성이므로 로그오프해도 로컬 프로필 유지됨)

# === Step 3: 다른 Admin 계정으로 로그인 후 DefProf 실행 ===
DefProf.exe DOMAIN\adminuser

# === Step 4: Default Profile 업데이트 확인 ===
Test-Path "C:\Users\Default\NTUSER.DAT"

# === Step 5: 작업 계정 프로필 정리 (선택) ===
Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -eq "C:\Users\adminuser" } | Remove-CimInstance

# === Step 6: FSLogix 재활성화 ===
Set-ItemProperty -Path "HKLM:\SOFTWARE\FSLogix\Profiles" -Name "Enabled" -Value 1
Restart-Service frxsvc

# === Step 7: Snapshot → Push Image ===
```

### Alternative: Without DefProf (Manual Copy) / DefProf 없이 수동 복사

```powershell
# 기존 Default Profile 백업
Rename-Item "C:\Users\Default" "C:\Users\Default.bak"

# 프로필 복사 (숨김/시스템 파일 포함)
robocopy "C:\Users\작업계정" "C:\Users\Default" /E /COPYALL /XJ `
    /XD "AppData\Local\Temp" /XF "NTUSER.DAT.LOG*" "ntuser.dat.LOG*"

# 레지스트리 하이브 복사
reg load HKU\TempHive "C:\Users\작업계정\NTUSER.DAT"
reg save HKU\TempHive "C:\Users\Default\NTUSER.DAT" /y
reg unload HKU\TempHive

# 권한 재설정
icacls "C:\Users\Default" /reset /T /C
```

> **Recommendation**: 수동 복사는 SID 잔존, 권한 문제 리스크가 있으므로 **DefProf 또는 sysprep CopyProfile 방식을 권장**합니다.

### Automation Script / 자동화 스크립트

이 절차를 자동화한 PowerShell 스크립트가 제공됩니다:

- 위치: `docs/procedures/Update-DefaultProfile.ps1`
- 사용법:
  ```powershell
  # 1단계: FSLogix 비활성화
  .\Update-DefaultProfile.ps1 -Action Prepare

  # 2단계: 작업 계정 로그인 → 커스터마이징 → 로그아웃 → 다른 Admin으로 로그인
  .\Update-DefaultProfile.ps1 -Action Apply -SourceUser "DOMAIN\adminuser"
  ```

### Key Rules / 핵심 규칙

| Rule | Description |
|------|-------------|
| FSLogix 비활성화 먼저 | Master VM 작업 시 항상 `Enabled=0` 상태에서 진행 |
| 다른 계정에서 DefProf 실행 | 복사 대상 프로필이 로그아웃(언로드) 상태여야 함 |
| 작업 완료 후 FSLogix 재활성화 | `Enabled=1` 복원 후 스냅샷 |
| Built-in Administrator 주의 | sysprep CopyProfile은 SID-500 프로필만 복사 |

---

## 8. Logoff Script / redirections.xml Not Working — Troubleshooting

> GPO 로그오프 스크립트 또는 FSLogix redirections.xml이 적용되지 않는 경우의 진단 가이드입니다.
>
> Troubleshooting guide for GPO logoff scripts or FSLogix redirections.xml not taking effect in Instant Clone environments.

### Symptom / 증상

- `rsop.msc`에서 로그오프 스크립트가 정상 표시되지만 실제 실행되지 않음
- `redirections.xml`에 정의한 Exclude 폴더가 VHD에 계속 포함됨
- 로그오프 후 사용자 데이터가 초기화되지 않음

### Cause 1: PowerShell Execution Policy (Most Common) / 실행 정책 차단

GPO 로그오프 스크립트의 `.ps1` 파일은 기본 실행 정책(`Restricted`)에 의해 **조용히 차단**됩니다.

```powershell
# 현재 실행 정책 확인
Get-ExecutionPolicy -List
```

**Fix — GPO로 실행 정책 변경:**
```
Computer Configuration > Administrative Templates > Windows Components > Windows PowerShell
  → "Turn on Script Execution" → Enabled → "Allow all scripts"
```

### Cause 2: GPO Script Invocation Method / 스크립트 호출 방식 오류

GPO Logoff Scripts에 `.ps1`을 직접 등록하면 `cmd.exe`로 실행되어 PowerShell이 호출되지 않을 수 있습니다.

**Incorrect (문제):**
```
Script Name:    logoff-cleanup.ps1
Parameters:     (empty)
```

**Correct (해결):**
```
Script Name:    %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
Parameters:     -ExecutionPolicy Bypass -NoProfile -File "C:\Scripts\logoff-cleanup.ps1"
```

### Cause 3: Network Disconnection at Logoff / 로그오프 시 네트워크 단절

로그오프 시점에 네트워크가 먼저 끊기면 `\\domain\NETLOGON\` 경로의 스크립트를 읽지 못합니다.

**Fix — 스크립트를 Master VM 로컬에 배치:**
```powershell
# Master VM에 스크립트 로컬 복사
New-Item -Path "C:\Scripts" -ItemType Directory -Force
Copy-Item "\\domain\NETLOGON\logoff-cleanup.ps1" "C:\Scripts\logoff-cleanup.ps1"

# GPO에서 로컬 경로로 참조
# Parameters: -ExecutionPolicy Bypass -NoProfile -File "C:\Scripts\logoff-cleanup.ps1"
```

### Cause 4: FSLogix VHD Unmount Timing / VHD 언마운트 타이밍

FSLogix는 로그오프 시 VHD를 언마운트합니다. 로그오프 스크립트 실행 시점에 이미 VHD가 분리되면 `$env:USERPROFILE` 경로가 무효화됩니다.

```
로그오프 시작 → FSLogix VHD 언마운트 → 로그오프 스크립트 실행 → $env:USERPROFILE 무효
```

**이 경우 로그오프 스크립트(D-3)보다 redirections.xml(D-2)이 더 안정적입니다.**

### Cause 5: GPO Overriding Local Registry / GPO가 로컬 레지스트리를 덮어쓰는 경우

FSLogix 설정을 로컬 레지스트리(`HKLM:\SOFTWARE\FSLogix\Profiles`)로 직접 했는데, GPO에서도 FSLogix 정책을 배포하고 있으면 **GPO 정책 경로가 우선**합니다. 두 경로의 VHDLocations가 다르면 redirections.xml 위치도 달라집니다.

```powershell
# 로컬 레지스트리 설정 (수동)
Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles"

# GPO 정책 설정 (이쪽이 우선!)
Get-ItemProperty "HKLM:\SOFTWARE\Policies\FSLogix\Profiles" -ErrorAction SilentlyContinue
```

**GPO 쪽에 VHDLocations가 설정되어 있으면 그 경로의 루트에 redirections.xml을 배치해야 합니다.**

### Cause 6: RedirXMLSourceFolder Registry Override / RedirXMLSourceFolder 레지스트리

FSLogix는 기본적으로 VHDLocations 경로에서 redirections.xml을 읽지만, `RedirXMLSourceFolder` 레지스트리가 설정되어 있으면 **그 경로를 우선**합니다.

```powershell
# 이 값이 설정되어 있으면 VHDLocations 루트 대신 이 경로에서 읽음
(Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles").RedirXMLSourceFolder
(Get-ItemProperty "HKLM:\SOFTWARE\Policies\FSLogix\Profiles" -EA SilentlyContinue).RedirXMLSourceFolder
```

- 값이 있으면 → 해당 경로에 redirections.xml을 배치해야 함
- 값이 없으면 → VHDLocations 루트가 맞음

### Cause 7: redirections.xml Location Error / 파일 위치 오류

redirections.xml은 반드시 **실제 적용되는 VHDLocations 경로(또는 RedirXMLSourceFolder)의 루트**에 있어야 합니다.

```powershell
# 실제 적용되는 경로 확인
$gpo   = Get-ItemProperty "HKLM:\SOFTWARE\Policies\FSLogix\Profiles" -EA SilentlyContinue
$local = Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles" -EA SilentlyContinue

# GPO가 있으면 GPO 우선
$effectiveVHD = if ($gpo -and $gpo.VHDLocations) { $gpo.VHDLocations } else { $local.VHDLocations }
$effectiveRedir = if ($gpo -and $gpo.RedirXMLSourceFolder) { $gpo.RedirXMLSourceFolder }
                  elseif ($local.RedirXMLSourceFolder) { $local.RedirXMLSourceFolder }
                  else { $effectiveVHD }

Write-Host "redirections.xml should be at: $effectiveRedir\redirections.xml"
Test-Path "$effectiveRedir\redirections.xml"
```

```
# 정상
VHDLocations = \\fileserver\profiles$
redirections.xml 위치: \\fileserver\profiles$\redirections.xml        (O)

# 오류 — 사용자 폴더 안에 넣으면 인식 안됨
redirections.xml 위치: \\fileserver\profiles$\user1\redirections.xml  (X)
```

### Cause 8: redirections.xml Syntax or Encoding Error / XML 문법 및 인코딩 오류

```powershell
# XML 파싱 테스트
[xml]$xml = Get-Content "\\fileserver\profiles$\redirections.xml"
$xml.FrxProfileFolderRedirection.Exclude | Format-Table
```

에러 발생 시 인코딩, 태그 닫힘, 특수문자 이스케이프를 확인하세요.

```powershell
# 인코딩 확인 (BOM 여부)
$bytes = [System.IO.File]::ReadAllBytes("\\fileserver\profiles$\redirections.xml")
Write-Host "First 3 bytes: $($bytes[0]) $($bytes[1]) $($bytes[2])"
# UTF-8 BOM (239 187 191) → BOM 없는 UTF-8로 다시 저장 필요
# UTF-16 LE (255 254) → UTF-8로 변환 필요
```

### Cause 9: FSLogix Version Bug / FSLogix 구버전 버그

구버전 FSLogix에서 redirections.xml 관련 버그가 있었습니다.

```powershell
# FSLogix 버전 확인
(Get-Item "C:\Program Files\FSLogix\Apps\frx.exe").VersionInfo.FileVersion
```

**2210 hotfix 1 (2.9.8612.60056) 이상** 권장. 그 이하 버전은 redirections.xml 파싱 관련 알려진 이슈가 있습니다.

### Diagnostic: Debug Logging / 디버그 로그 추가

로그오프 스크립트 맨 위에 추가하여 실행 여부를 확인합니다:

```powershell
# logoff-cleanup.ps1 맨 위에 추가
$logFile = "C:\ProgramData\FSLogix\Logs\cleanup-debug.log"
Add-Content -Path $logFile -Value "=== Script started: $env:USERNAME at $(Get-Date) ==="
Add-Content -Path $logFile -Value "USERPROFILE: $env:USERPROFILE"
Add-Content -Path $logFile -Value "Profile exists: $(Test-Path $env:USERPROFILE)"

# ... 기존 정리 로직 ...

Add-Content -Path $logFile -Value "=== Script completed: $(Get-Date) ==="
```

로그오프 후 확인:
```powershell
# 파일 없음 → 스크립트 자체가 실행 안 됨 (Cause 1, 2, 3 점검)
# 파일 있음 → 스크립트 실행됐지만 삭제 실패 (Cause 4 — VHD 타이밍 문제)
Get-Content "C:\ProgramData\FSLogix\Logs\cleanup-debug.log"
```

### Diagnostic: redirections.xml Verification / 적용 확인

```powershell
# 로그인 세션에서 redirect 동작 확인
frx list-redirects

# FSLogix 로그에서 redirections 처리 확인
Select-String -Path "C:\ProgramData\FSLogix\Logs\Profile*.log" -Pattern "redirect" -Context 3
```

- `Processing redirections.xml` 로그 있음 → 정상 인식
- redirect 관련 로그 없음 → 파일 위치 또는 파일명 오류

### Diagnosis Result Summary / 진단 결과별 조치

| Diagnosis Result | Cause | Action |
|------------------|-------|--------|
| cleanup-debug.log 파일 없음 | 스크립트 미실행 | Cause 1, 2, 3 순서대로 점검 |
| cleanup-debug.log 있지만 삭제 안됨 | VHD 언마운트 타이밍 | redirections.xml(D-2) 방식으로 전환 |
| GPO VHDLocations ≠ 로컬 VHDLocations | GPO가 경로 덮어씀 | GPO 경로 루트에 redirections.xml 배치 (Cause 5) |
| RedirXMLSourceFolder 설정됨 | XML 검색 경로 다름 | 해당 경로에 redirections.xml 배치 (Cause 6) |
| FSLogix 로그에 redirect 없음 | redirections.xml 위치/경로 오류 | 실제 적용 경로 확인 후 재배치 (Cause 7) |
| FSLogix 로그에 redirect 에러 | XML 문법/인코딩 오류 | XML 파싱 + 인코딩 테스트 후 수정 (Cause 8) |
| `frx list-redirects` 항목 없음 | redirections.xml 미인식 | 파일명, 경로, 인코딩, 버전 확인 |
| FSLogix 버전 < 2.9.8612 | 구버전 버그 | FSLogix 업데이트 (Cause 9) |

### Automated Diagnostic Script / 자동 진단 스크립트

위 원인을 한번에 점검하는 자동 진단 스크립트가 제공됩니다:

- 위치: `docs/procedures/fslogix-redirections-diagnostic.ps1`
- VDI 세션에 로그인한 상태에서 관리자 PowerShell로 실행
- 점검 항목: FSLogix 버전, 로컬 vs GPO 레지스트리 비교, 실제 적용 경로 판단, redirections.xml 존재/인코딩/파싱, `frx list-redirects`, FSLogix 로그 분석
- 결과가 화면 출력 + `C:\ProgramData\FSLogix\Logs\redirections-diagnostic-날짜.txt` 에 자동 저장

```powershell
# VDI 세션에서 관리자 PowerShell로 실행
.\fslogix-redirections-diagnostic.ps1
```

### Recommendation / 권장사항

```
우선순위:
1. 자동 진단 스크립트로 실제 적용 경로 확인
2. redirections.xml(D-2)을 올바른 경로에 배치 → 이것만으로 충분
3. 부족한 경우에만 로그오프 스크립트(D-3) 보조 추가
```

로그오프 스크립트는 VHD 언마운트 타이밍, 실행 정책, 네트워크 단절 등 불안정 요소가 많으므로 **redirections.xml 방식을 우선 적용**하는 것을 권장합니다.

---

## 9. Horizon Instant Clone Optimization Checklist

### Master Image Preparation

- [ ] Install latest VMware Tools
- [ ] Install latest Windows Updates
- [ ] Run VMware OS Optimization Tool (OSOT) with Windows 11 template
- [ ] Remove provisioned AppX packages (verify <= 5 remaining)
- [ ] Disable AppX-related services and scheduled tasks
- [ ] Apply GPO settings (Store, Cloud Content, AppX Deployment)
- [ ] Install FSLogix Agent (if using Solution B/C)
- [ ] Configure FSLogix registry settings
- [ ] Install required applications
- [ ] Run Windows Disk Cleanup
- [ ] Defragment (SSD: TRIM, HDD: Defrag)
- [ ] Run `sfc /scannow` to verify system integrity
- [ ] Seal image: `C:\Windows\Setup\Scripts\Optimize-VMwareHorizonOS.ps1` (if available)

### Post-Deployment Validation

- [ ] Verify login time < 30 seconds (no AppX message)
- [ ] Verify FSLogix profile mounts correctly (if applicable)
- [ ] Verify no "Updating Store App" message
- [ ] Verify essential apps function (Edge, Settings, Start Menu)
- [ ] Verify GPO settings applied (`gpresult /r`)

---

## 10. Diagnostic Commands

### AppX Package Diagnostics

```powershell
# Count remaining provisioned packages
Get-AppxProvisionedPackage -Online | Measure-Object

# List all provisioned packages
Get-AppxProvisionedPackage -Online | Select-Object DisplayName, PackageName | Format-Table -AutoSize

# Check AppX per-user packages
Get-AppxPackage | Select-Object Name, Status, InstallLocation | Format-Table -AutoSize

# Check AppX deployment service status
Get-Service AppXSvc | Select-Object Name, Status, StartType

# Check AppX-related scheduled tasks
Get-ScheduledTask | Where-Object { $_.TaskPath -like "*Appx*" -or $_.TaskPath -like "*InstallService*" } |
    Select-Object TaskName, State, TaskPath
```

### FSLogix Diagnostics

```powershell
# Check FSLogix service status
Get-Service frxsvc, frxccds | Select-Object Name, Status, StartType

# Check FSLogix profile attachment
frx list-redirects

# Check FSLogix configuration
Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles"

# Check FSLogix logs
Get-Content "C:\ProgramData\FSLogix\Logs\Profile*.log" -Tail 50

# Verify VHD mount status (during user session)
Get-Volume | Where-Object { $_.FileSystem -eq 'NTFS' -and $_.DriveType -eq 'Fixed' }
```

### Horizon Instant Clone Diagnostics

```powershell
# Check VMware Horizon Agent services
Get-Service vmware* | Select-Object Name, Status, StartType

# Check Instant Clone optimization state
Get-ItemProperty "HKLM:\SOFTWARE\VMware, Inc.\VMware VDM\Node Manager" -ErrorAction SilentlyContinue

# Check user profile state
Get-WmiObject Win32_UserProfile | Where-Object { -not $_.Special } |
    Select-Object LocalPath, Loaded, LastUseTime
```

---

## 11. Log File Locations

| Component | Log Path | Description |
|-----------|----------|-------------|
| AppX Deployment | `%WINDIR%\Logs\CBS\CBS.log` | Component-Based Servicing (AppX install/remove) |
| AppX Deployment | `Microsoft-Windows-AppXDeploymentServer/Operational` (Event Log) | Per-user AppX registration events |
| AppX Deployment | `Microsoft-Windows-AppxPackagingOM/Microsoft-Windows-AppX-Deployment-Server` | Detailed deployment logs |
| FSLogix Profile | `C:\ProgramData\FSLogix\Logs\Profile*.log` | Profile container mount/dismount |
| FSLogix ODFC | `C:\ProgramData\FSLogix\Logs\ODFC*.log` | Office container logs |
| Horizon Agent | `%ProgramData%\VMware\VDM\logs\` | Horizon Agent logs |
| Instant Clone | `C:\Windows\Temp\vmware-viewcomposer-ga-new.log` | Instant Clone customization |
| User Profile | `%WINDIR%\Debug\UserMode\userenv.log` | Profile load/unload |
| Group Policy | `%WINDIR%\Debug\UserMode\gpsvc.log` | GPO processing |

### Key Event Log Channels

```powershell
# AppX deployment events
Get-WinEvent -LogName "Microsoft-Windows-AppXDeploymentServer/Operational" -MaxEvents 20 |
    Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# User profile events
Get-WinEvent -LogName "Microsoft-Windows-User Profile Service/Operational" -MaxEvents 20 |
    Select-Object TimeCreated, Id, Message | Format-Table -Wrap
```

---

## 12. References

### VMware / Broadcom

| Reference | Description |
|-----------|-------------|
| [VMware OS Optimization Tool (OSOT)](https://flings.vmware.com/vmware-os-optimization-tool) | Official VMware tool for OS optimization in VDI environments |
| [VMware Horizon Documentation](https://docs.vmware.com/en/VMware-Horizon/index.html) | Official Horizon documentation |
| [KB 2150337](https://knowledge.broadcom.com/external/article/2150337) | Optimizing Windows for Horizon Virtual Desktops |
| [KB 2032056](https://knowledge.broadcom.com/external/article/2032056) | Creating optimized Windows images for Horizon |

### Microsoft / FSLogix

| Reference | Description |
|-----------|-------------|
| [FSLogix Documentation](https://learn.microsoft.com/en-us/fslogix/) | Official FSLogix documentation |
| [FSLogix Download](https://aka.ms/fslogix-latest) | Latest FSLogix agent download |
| [FSLogix Profile Container Configuration](https://learn.microsoft.com/en-us/fslogix/reference-configuration-settings) | Registry configuration reference |
| [FSLogix with Non-Persistent VDI](https://learn.microsoft.com/en-us/fslogix/concepts-fslogix-non-persistent) | FSLogix in non-persistent environments |
| [Remove Provisioned AppX Packages](https://learn.microsoft.com/en-us/powershell/module/dism/remove-appxprovisionedpackage) | Microsoft DISM PowerShell reference |

### Best Practice Guides

| Reference | Description |
|-----------|-------------|
| [Windows 11 VDI Optimization Guide](https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/vdi-optimization-guide) | Microsoft official VDI optimization guide |
| [VMware DEM + FSLogix Integration](https://techzone.vmware.com/resource/managing-user-profiles-vmware-horizon) | VMware TechZone profile management |

---

> **vSphere 7.0 EOL Notice**: vSphere 7.0 reached End of General Support on 2025-10-02 (KB 322186). If running Horizon on vSphere 7.0 infrastructure, plan migration to vSphere 8.0+.
>
> **Note**: This document covers Horizon VDI guest OS optimization. For Horizon infrastructure (Connection Server, UAG, vSphere platform), refer to official VMware Horizon documentation.
