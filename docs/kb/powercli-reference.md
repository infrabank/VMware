# PowerCLI Reference for vSphere 7.0

> Reference: [VMware PowerCLI Documentation](https://developer.vmware.com/powercli), [PowerCLI User Guide](https://developer.vmware.com/docs/powercli/latest/), [PowerShell Gallery](https://www.powershellgallery.com/packages/VMware.PowerCLI)

---

## 개요 / Overview

VMware PowerCLI는 PowerShell 기반의 vSphere 자동화 및 관리 도구입니다. vCenter, ESXi, vSAN, NSX, vCloud Director 등 VMware 제품을 명령줄에서 제어할 수 있습니다.

VMware PowerCLI is a PowerShell-based automation and management toolkit for vSphere environments. It enables command-line control of vCenter, ESXi, vSAN, NSX, and other VMware products.

### 버전 호환성 / Version Compatibility

| PowerCLI Version | vSphere 7.0 Support | PowerShell Requirement |
|------------------|--------------------|-----------------------|
| 13.x (Latest) | Full support | PowerShell 5.1 / 7.x |
| 12.7 | Full support | PowerShell 5.1 / 7.x |
| 12.x | Full support | PowerShell 5.1 / 7.x |
| 11.x | Supported | PowerShell 5.1 |

### 설치 / Installation

```powershell
# PowerShell Gallery에서 설치 (권장) / Install from PowerShell Gallery (recommended)
# SAFE - read/install operation
Install-Module -Name VMware.PowerCLI -Scope CurrentUser

# 특정 버전 설치 / Install specific version
Install-Module -Name VMware.PowerCLI -RequiredVersion 13.2.0 -Scope CurrentUser

# 업데이트 / Update existing installation
Update-Module -Name VMware.PowerCLI

# 설치 확인 / Verify installation
Get-Module -Name VMware.PowerCLI -ListAvailable

# 버전 확인 / Check version
Get-PowerCLIVersion
```

---

## 연결 관리 / Connection Management

### 기본 연결 / Basic Connection

```powershell
# vCenter 연결 (대화형 자격증명) / Connect to vCenter (interactive credentials)
# SAFE
Connect-VIServer -Server vcenter.example.com

# 자격증명 직접 지정 / Specify credentials directly
# MODERATE - credentials in session memory
Connect-VIServer -Server vcenter.example.com -User administrator@vsphere.local -Password 'P@ssw0rd!'

# Get-Credential 사용 (권장 - 패스워드 숨김) / Use Get-Credential (recommended)
# SAFE
$cred = Get-Credential
Connect-VIServer -Server vcenter.example.com -Credential $cred

# 연결 상태 확인 / Check connection status
$global:DefaultVIServers

# 연결 해제 / Disconnect
Disconnect-VIServer -Server vcenter.example.com -Confirm:$false
Disconnect-VIServer -Server * -Confirm:$false    # 모든 연결 해제 / Disconnect all
```

### 다중 vCenter 연결 / Multi-vCenter Connection

```powershell
# 여러 vCenter 동시 연결 / Connect to multiple vCenters simultaneously
# SAFE
$vcenters = @("vc1.example.com", "vc2.example.com", "vc3.example.com")
$cred = Get-Credential
$vcenters | ForEach-Object { Connect-VIServer -Server $_ -Credential $cred }

# 연결된 모든 서버 확인 / List all connected servers
$global:DefaultVIServers | Select-Object Name, IsConnected, User, Port

# 특정 서버 대상 cmdlet 실행 / Run cmdlet against specific server
Get-VM -Server vc1.example.com
```

### 자격증명 저장소 / Credential Store

```powershell
# 암호화된 자격증명 저장 (재사용 스크립트용) / Save encrypted credentials (for reuse in scripts)
# MODERATE - stores credentials on disk
New-VICredentialStoreItem -Host vcenter.example.com -User administrator@vsphere.local -Password 'P@ssw0rd!'

# 저장된 자격증명으로 연결 / Connect using stored credentials
Connect-VIServer -Server vcenter.example.com

# 저장된 자격증명 목록 / List stored credentials
Get-VICredentialStoreItem

# 자격증명 삭제 / Remove stored credentials
Remove-VICredentialStoreItem -Host vcenter.example.com -User administrator@vsphere.local
```

### 인증서 설정 / Certificate Configuration

```powershell
# 자체 서명 인증서 경고 무시 (LAB 환경만) / Ignore self-signed cert warnings (LAB ONLY)
# MODERATE - reduces security posture
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false

# 프로덕션 환경: 인증서 검증 강제 / Production: enforce certificate validation
Set-PowerCLIConfiguration -InvalidCertificateAction Fail -Confirm:$false

# 현재 PowerCLI 설정 확인 / Check current PowerCLI configuration
Get-PowerCLIConfiguration

# 참여 데이터 수집 비활성화 (자동화 스크립트용) / Disable CEIP (for automation scripts)
Set-PowerCLIConfiguration -ParticipateInCeip $false -Confirm:$false
```

---

## 호스트 관리 / Host Management

### 호스트 조회 / Host Queries

```powershell
# 모든 ESXi 호스트 조회 / Get all ESXi hosts
# SAFE
Get-VMHost

# 이름으로 조회 / Get by name
Get-VMHost -Name "esxi01.example.com"

# 클러스터별 조회 / Get by cluster
Get-VMHost -Location (Get-Cluster "Production-Cluster")

# 호스트 상태 정보 / Host state information
Get-VMHost | Select-Object Name, State, ConnectionState, PowerState, Version, Build

# 호스트 하드웨어 정보 / Host hardware information
Get-VMHost | Get-VMHostHardware | Select-Object VMHost, Manufacturer, Model, MemorySlotCount, CpuCount

# 빌드 번호 및 버전 확인 / Check build number and version
Get-VMHost | Select-Object Name, Version, Build | Sort-Object Build
```

### 유지 관리 모드 / Maintenance Mode

```powershell
# 유지 관리 모드 진입 (VM 자동 마이그레이션 포함) / Enter maintenance mode (with VM migration)
# HIGH - impacts running workloads
Set-VMHost -VMHost "esxi01.example.com" -State Maintenance

# 유지 관리 모드 진입 (vSAN 데이터 마이그레이션 없이) / Enter maintenance without vSAN migration
# HIGH
Set-VMHost -VMHost "esxi01.example.com" -State Maintenance -VsanDataMigrationMode NoDataMigration

# 유지 관리 모드 해제 / Exit maintenance mode
# MODERATE
Set-VMHost -VMHost "esxi01.example.com" -State Connected

# 클러스터 전체 유지 관리 상태 확인 / Check maintenance state across cluster
Get-VMHost -Location (Get-Cluster "Prod") | Select-Object Name, State
```

### 호스트 프로파일 / Host Profiles

```powershell
# 호스트 프로파일 조회 / List host profiles
# SAFE
Get-VMHostProfile

# 참조 호스트에서 프로파일 생성 / Create profile from reference host
# MODERATE
New-VMHostProfile -Name "Prod-ESXi-Profile" -ReferenceHost (Get-VMHost "esxi01.example.com")

# 프로파일 호스트에 연결 / Associate profile with host
# MODERATE
Apply-VMHostProfile -VMHostProfile "Prod-ESXi-Profile" -Host (Get-VMHost "esxi02.example.com") -Variable @{}

# 컴플라이언스 확인 / Check compliance
Test-VMHostProfileCompliance -VMHostProfile "Prod-ESXi-Profile" -VMHost (Get-VMHost "esxi02.example.com")
```

### 호스트 서비스 및 설정 / Host Services and Settings

```powershell
# SSH 서비스 상태 확인 / Check SSH service status
# SAFE
Get-VMHost | Get-VMHostService | Where-Object {$_.Key -eq "TSM-SSH"} | Select-Object VMHost, Key, Running, Policy

# SSH 서비스 시작 / Start SSH service
# MODERATE
Get-VMHost "esxi01.example.com" | Get-VMHostService -Key "TSM-SSH" | Start-VMHostService

# NTP 서버 설정 / Configure NTP servers
# MODERATE
Get-VMHost "esxi01.example.com" | Add-VMHostNtpServer -NtpServer "ntp.example.com"
Get-VMHost "esxi01.example.com" | Get-VMHostNtpServer

# 고급 설정 변경 / Modify advanced settings
# MODERATE
Get-VMHost "esxi01.example.com" | Get-AdvancedSetting -Name "UserVars.SuppressShellWarning" | Set-AdvancedSetting -Value 1 -Confirm:$false
```

---

## VM 관리 / VM Management

### VM 조회 / VM Queries

```powershell
# 모든 VM 조회 / Get all VMs
# SAFE
Get-VM

# 이름 패턴으로 조회 / Get by name pattern (wildcard)
Get-VM -Name "web-*"

# 전원 상태별 조회 / Filter by power state
Get-VM | Where-Object {$_.PowerState -eq "PoweredOff"}
Get-VM | Where-Object {$_.PowerState -eq "PoweredOn"}

# VM 상세 정보 / Detailed VM information
Get-VM "webserver01" | Select-Object Name, PowerState, NumCpu, MemoryGB, ProvisionedSpaceGB, UsedSpaceGB, Guest

# 게스트 OS 정보 / Guest OS information
Get-VM | Get-VMGuest | Select-Object VM, OSFullName, IPAddress, Hostname
```

### VM 전원 조작 / VM Power Operations

```powershell
# VM 전원 켜기 / Power on VM
# MODERATE
Start-VM -VM "webserver01" -Confirm:$false

# VM 게스트 정상 종료 (Guest OS shutdown) / Guest shutdown (graceful)
# MODERATE
Stop-VM -VM "webserver01" -Confirm:$false    # 강제 전원 끄기 / Force power off

# 게스트 OS 종료 (VMware Tools 필요) / Guest OS shutdown (requires VMware Tools)
# MODERATE
Shutdown-VMGuest -VM "webserver01" -Confirm:$false

# VM 재시작 / Restart VM
# MODERATE
Restart-VMGuest -VM "webserver01" -Confirm:$false

# 여러 VM 일괄 전원 켜기 / Bulk power on
# HIGH - impacts cluster resources
Get-VM -Name "batch-*" | Start-VM -Confirm:$false
```

### VM 생성 및 복제 / VM Creation and Cloning

```powershell
# 템플릿에서 VM 클론 생성 / Clone VM from template
# MODERATE
New-VM -Name "webserver02" `
       -Template (Get-Template "Windows2019-Template") `
       -VMHost (Get-VMHost "esxi01.example.com") `
       -Datastore (Get-Datastore "SSD-DS01") `
       -Location (Get-Folder "Production")

# 기존 VM에서 클론 / Clone from existing VM
# MODERATE
New-VM -Name "webserver03" `
       -VM (Get-VM "webserver01") `
       -VMHost (Get-VMHost "esxi02.example.com") `
       -Datastore (Get-Datastore "SSD-DS02")

# 리소스 풀 지정 클론 / Clone with resource pool
# MODERATE
New-VM -Name "testserver01" `
       -Template (Get-Template "RHEL8-Template") `
       -ResourcePool (Get-ResourcePool "Dev-Pool") `
       -Datastore (Get-Datastore "Test-DS")

# VM 하드웨어 변경 / Modify VM hardware
# MODERATE - requires VM power off for most changes
Set-VM -VM "webserver01" -NumCpu 4 -MemoryGB 8 -Confirm:$false
```

### VM 삭제 / VM Removal

```powershell
# VM 등록 해제만 (파일 유지) / Unregister only (keep files)
# HIGH
Remove-VM -VM "oldserver01" -DeletePermanently:$false -Confirm:$false

# VM 영구 삭제 (파일 포함) / Permanently delete VM (including files)
# HIGH - IRREVERSIBLE
Remove-VM -VM "oldserver01" -DeletePermanently:$true -Confirm:$false
```

---

## 스냅샷 관리 / Snapshot Management

### 스냅샷 조회 / Snapshot Queries

```powershell
# VM 스냅샷 목록 / List snapshots for a VM
# SAFE
Get-VM "webserver01" | Get-Snapshot

# 모든 VM의 스냅샷 목록 및 크기 / All VM snapshots with size info
Get-VM | Get-Snapshot | Select-Object VM, Name, Description, Created, SizeMB | Sort-Object SizeMB -Descending

# 오래된 스냅샷 탐지 (30일 초과) / Detect old snapshots (older than 30 days)
$cutoff = (Get-Date).AddDays(-30)
Get-VM | Get-Snapshot | Where-Object {$_.Created -lt $cutoff} | `
    Select-Object VM, Name, Created, SizeMB | Sort-Object Created
```

### 스냅샷 생성 및 복원 / Snapshot Create and Revert

```powershell
# 스냅샷 생성 (메모리 포함) / Create snapshot with memory
# MODERATE - brief I/O pause
New-Snapshot -VM "webserver01" -Name "Pre-Patch-$(Get-Date -f yyyyMMdd)" -Description "Before OS patching" -Memory $true -Quiesce $false

# 스냅샷 생성 (메모리 없음, 빠름) / Create snapshot without memory (faster)
New-Snapshot -VM "webserver01" -Name "Pre-Patch-$(Get-Date -f yyyyMMdd)" -Memory $false -Quiesce $false

# 스냅샷으로 복원 / Revert to snapshot
# HIGH - discards all changes since snapshot
Set-VM -VM "webserver01" -Snapshot (Get-Snapshot -VM "webserver01" -Name "Pre-Patch-*") -Confirm:$false
```

### 스냅샷 일괄 정리 / Bulk Snapshot Cleanup

```powershell
# 30일 이상 된 스냅샷 일괄 삭제 / Bulk delete snapshots older than 30 days
# HIGH - IRREVERSIBLE
$cutoff = (Get-Date).AddDays(-30)
$oldSnaps = Get-VM | Get-Snapshot | Where-Object {$_.Created -lt $cutoff}
$oldSnaps | ForEach-Object {
    Write-Host "Removing: $($_.VM.Name) - $($_.Name) (Created: $($_.Created))"
    Remove-Snapshot -Snapshot $_ -RemoveChildren $false -Confirm:$false
}

# 특정 VM의 모든 스냅샷 삭제 / Remove all snapshots for specific VM
# HIGH - IRREVERSIBLE
Get-VM "webserver01" | Get-Snapshot | Remove-Snapshot -RemoveChildren $true -Confirm:$false

# 스냅샷 정리 전 보고서 출력 / Print report before cleanup
Get-VM | Get-Snapshot | Select-Object `
    @{N="VM";E={$_.VM.Name}}, `
    @{N="Snapshot";E={$_.Name}}, `
    @{N="Created";E={$_.Created}}, `
    @{N="AgeDays";E={((Get-Date) - $_.Created).Days}}, `
    @{N="SizeGB";E={[math]::Round($_.SizeMB/1024, 2)}} | `
    Sort-Object AgeDays -Descending | Format-Table -AutoSize
```

---

## 스토리지 관리 / Storage Management

### 데이터스토어 조회 / Datastore Queries

```powershell
# 모든 데이터스토어 조회 / List all datastores
# SAFE
Get-Datastore

# 용량 정보 포함 조회 / With capacity information
Get-Datastore | Select-Object Name, Type, CapacityGB, FreeSpaceGB, `
    @{N="UsedGB";E={[math]::Round($_.CapacityGB - $_.FreeSpaceGB, 1)}}, `
    @{N="UsedPct";E={[math]::Round((($_.CapacityGB - $_.FreeSpaceGB) / $_.CapacityGB) * 100, 1)}} | `
    Sort-Object UsedPct -Descending

# 임계치 초과 데이터스토어 알림 (85% 이상) / Alert on datastores over 85% full
Get-Datastore | Where-Object {
    $usedPct = (($_.CapacityGB - $_.FreeSpaceGB) / $_.CapacityGB) * 100
    $usedPct -gt 85
} | Select-Object Name, @{N="UsedPct";E={[math]::Round((($_.CapacityGB - $_.FreeSpaceGB) / $_.CapacityGB) * 100, 1)}}
```

### 스토리지 정책 / Storage Policies

```powershell
# VM 스토리지 정책 조회 / Query VM storage policies
# SAFE
Get-SpbmStoragePolicy

# VM에 적용된 정책 확인 / Check policy applied to VM
Get-VM "webserver01" | Get-SpbmEntityConfiguration

# VM 디스크에 정책 적용 / Apply storage policy to VM disk
# MODERATE
$policy = Get-SpbmStoragePolicy -Name "vSAN Default Storage Policy"
Get-VM "webserver01" | Get-HardDisk | Set-SpbmEntityConfiguration -StoragePolicy $policy -Confirm:$false

# 정책 컴플라이언스 확인 / Check policy compliance
Get-VM | Get-SpbmEntityConfiguration | Where-Object {$_.ComplianceStatus -ne "compliant"} | `
    Select-Object Entity, StoragePolicy, ComplianceStatus
```

### VMFS 및 NFS / VMFS and NFS

```powershell
# 데이터스토어에서 VM 파일 탐색 / Browse VM files on datastore
# SAFE
Get-Datastore "SSD-DS01" | Get-DatastoreBrowser | Start-Browse

# NFS 데이터스토어 추가 / Add NFS datastore
# MODERATE
New-Datastore -VMHost (Get-VMHost "esxi01.example.com") `
              -Name "NFS-Backup" `
              -Path "/vol/backup" `
              -NfsHost "nas.example.com" `
              -Nfs

# 데이터스토어 마운트 해제 / Unmount datastore
# HIGH - impacts VMs using this datastore
Remove-Datastore -Datastore "Old-DS" -VMHost (Get-VMHost "esxi01.example.com") -Confirm:$false
```

---

## 네트워크 관리 / Network Management

### 표준 스위치 / Standard vSwitch

```powershell
# vSwitch 목록 / List vSwitches
# SAFE
Get-VMHost | Get-VirtualSwitch

# vSwitch 생성 / Create vSwitch
# MODERATE
New-VirtualSwitch -VMHost (Get-VMHost "esxi01.example.com") -Name "vSwitch1" -NumPorts 64

# 포트 그룹 조회 / List port groups
Get-VirtualPortGroup

# 포트 그룹 생성 (VLAN 포함) / Create port group with VLAN
# MODERATE
New-VirtualPortGroup -VirtualSwitch (Get-VirtualSwitch -VMHost "esxi01.example.com" -Name "vSwitch1") `
                     -Name "VLAN100-PG" -VLanId 100

# MTU 설정 / Set MTU
# MODERATE
Get-VMHost "esxi01.example.com" | Get-VirtualSwitch -Name "vSwitch1" | Set-VirtualSwitch -Mtu 9000 -Confirm:$false
```

### 분산 스위치 / Distributed vSwitch (vDS)

```powershell
# vDS 조회 / List distributed switches
# SAFE
Get-VDSwitch

# vDS 포트 그룹 조회 / List vDS port groups
Get-VDPortgroup

# vDS에 호스트 추가 / Add host to vDS
# HIGH - network reconfiguration
Add-VDSwitchVMHost -VDSwitch (Get-VDSwitch "dvSwitch-Prod") -VMHost (Get-VMHost "esxi03.example.com")

# VM을 vDS 포트 그룹으로 이동 / Move VM NIC to vDS port group
# MODERATE
Get-VM "webserver01" | Get-NetworkAdapter | `
    Set-NetworkAdapter -Portgroup (Get-VDPortgroup "VLAN200-vDS-PG") -Confirm:$false

# 포트 그룹 VLAN 변경 / Change port group VLAN
# MODERATE
Get-VDPortgroup "VLAN100-vDS-PG" | Set-VDPortgroup -VlanId 110 -Confirm:$false
```

### VMkernel 어댑터 / VMkernel Adapters

```powershell
# VMkernel 어댑터 조회 / List VMkernel adapters
# SAFE
Get-VMHost | Get-VMHostNetworkAdapter -VMKernel

# VMkernel 어댑터 생성 (vMotion) / Create VMkernel adapter for vMotion
# MODERATE
$vmhost = Get-VMHost "esxi01.example.com"
$pg = Get-VDPortgroup "vMotion-PG"
New-VMHostNetworkAdapter -VMHost $vmhost -VirtualSwitch (Get-VDSwitch "dvSwitch-Prod") `
                         -PortGroup $pg -IP "10.10.10.11" -SubnetMask "255.255.255.0" `
                         -VMotionEnabled $true
```

---

## 보고 스크립트 / Reporting Scripts

### 인벤토리 보고 / Inventory Report

```powershell
# 전체 VM 인벤토리 CSV 내보내기 / Full VM inventory export to CSV
# SAFE
Get-VM | Select-Object `
    Name, PowerState, NumCpu, MemoryGB, `
    @{N="ProvisionedGB";E={[math]::Round($_.ProvisionedSpaceGB,1)}}, `
    @{N="UsedGB";E={[math]::Round($_.UsedSpaceGB,1)}}, `
    @{N="Host";E={$_.VMHost.Name}}, `
    @{N="Cluster";E={$_.VMHost.Parent.Name}}, `
    @{N="Datastore";E={($_ | Get-Datastore).Name -join ","}}, `
    @{N="GuestOS";E={$_.Guest.OSFullName}}, `
    @{N="IPAddress";E={$_.Guest.IPAddress -join ","}} | `
    Export-Csv -Path "C:\Reports\VM-Inventory-$(Get-Date -f yyyyMMdd).csv" -NoTypeInformation

Write-Host "Report saved to C:\Reports\VM-Inventory-$(Get-Date -f yyyyMMdd).csv"
```

### 용량 보고 / Capacity Report

```powershell
# 클러스터별 용량 현황 / Capacity summary per cluster
# SAFE
Get-Cluster | ForEach-Object {
    $cluster = $_
    $hosts = Get-VMHost -Location $cluster
    $vms = Get-VM -Location $cluster
    [PSCustomObject]@{
        Cluster         = $cluster.Name
        Hosts           = $hosts.Count
        TotalCPU_GHz    = [math]::Round(($hosts | Measure-Object -Property CpuTotalMhz -Sum).Sum / 1000, 1)
        TotalMemGB      = [math]::Round(($hosts | Measure-Object -Property MemoryTotalGB -Sum).Sum, 1)
        UsedMemGB       = [math]::Round(($hosts | Measure-Object -Property MemoryUsageGB -Sum).Sum, 1)
        VMs             = $vms.Count
        PoweredOnVMs    = ($vms | Where-Object {$_.PowerState -eq "PoweredOn"}).Count
    }
} | Format-Table -AutoSize
```

### 보안 컴플라이언스 체크 / Security Compliance Check

```powershell
# SSH 활성화된 호스트 탐지 / Detect hosts with SSH enabled
# SAFE
Get-VMHost | Get-VMHostService | `
    Where-Object {$_.Key -eq "TSM-SSH" -and $_.Running -eq $true} | `
    Select-Object @{N="Host";E={$_.VMHost.Name}}, Key, Running, Policy

# 기본 인증서 사용 중인 호스트 탐지 / Detect hosts using default certificates
Get-VMHost | Where-Object {$_.ExtensionData.Config.Certificate.Count -eq 0} | Select-Object Name

# 로컬 계정 비밀번호 정책 확인 / Check local account password policy
Get-VMHost | Get-AdvancedSetting -Name "Security.PasswordComplexity" | `
    Select-Object @{N="Host";E={$_.Entity.Name}}, Name, Value
```

### VM 스프롤 탐지 / VM Sprawl Detection

```powershell
# 오래 꺼져 있는 VM 탐지 (90일 이상) / Detect VMs powered off for 90+ days
# SAFE
$cutoff = (Get-Date).AddDays(-90)
Get-VM | Where-Object {$_.PowerState -eq "PoweredOff"} | ForEach-Object {
    $lastEvent = Get-VIEvent -Entity $_ -MaxSamples 1 -Types Info | `
        Where-Object {$_ -is [VMware.Vim.VmPoweredOffEvent]} | Select-Object -First 1
    if ($lastEvent -and $lastEvent.CreatedTime -lt $cutoff) {
        [PSCustomObject]@{
            VM           = $_.Name
            PoweredOffOn = $lastEvent.CreatedTime
            DaysOff      = ((Get-Date) - $lastEvent.CreatedTime).Days
            ProvisionedGB = [math]::Round($_.ProvisionedSpaceGB, 1)
        }
    }
} | Sort-Object DaysOff -Descending | Format-Table -AutoSize
```

---

## 일괄 작업 / Bulk Operations

### ForEach-Object 패턴 / ForEach-Object Patterns

```powershell
# 클러스터 내 모든 호스트에 설정 적용 / Apply setting to all hosts in cluster
# MODERATE
Get-VMHost -Location (Get-Cluster "Prod") | ForEach-Object {
    $host = $_
    Write-Host "Configuring $($host.Name)..."
    $host | Get-AdvancedSetting "UserVars.SuppressShellWarning" | Set-AdvancedSetting -Value 1 -Confirm:$false
}

# 모든 VM에 메모 태그 추가 / Add note tag to all VMs in folder
# MODERATE
Get-VM -Location (Get-Folder "Production") | ForEach-Object {
    Set-VM -VM $_ -Description "Managed by Infra Team - $(Get-Date -f yyyy-MM-dd)" -Confirm:$false
}
```

### 파이프라인 운영 / Pipeline Operations

```powershell
# 데이터스토어별 VM 목록 / List VMs per datastore
Get-Datastore | ForEach-Object {
    $ds = $_
    $vms = Get-VM -Datastore $ds
    Write-Host "=== $($ds.Name) ($($vms.Count) VMs) ==="
    $vms | Select-Object Name, PowerState | Format-Table -AutoSize
}

# 특정 네트워크의 VM 찾기 / Find VMs on a specific network
Get-VM | Where-Object {
    ($_ | Get-NetworkAdapter).NetworkName -contains "VLAN100-PG"
} | Select-Object Name, @{N="Host";E={$_.VMHost.Name}}
```

### 병렬 실행 / Parallel Execution (PowerShell 7+)

```powershell
# PowerShell 7+ 병렬 스냅샷 생성 / Parallel snapshot creation (PowerShell 7+ only)
# MODERATE - I/O intensive on all VMs simultaneously
$vmNames = (Get-VM -Location (Get-Cluster "Prod") | Select-Object -ExpandProperty Name)
$vmNames | ForEach-Object -ThrottleLimit 5 -Parallel {
    $vmName = $_
    # 각 스레드에서 새 vCenter 연결 필요 / Each thread needs its own connection
    Connect-VIServer -Server $using:vcenter -Credential $using:cred -WarningAction SilentlyContinue | Out-Null
    New-Snapshot -VM (Get-VM $vmName) -Name "Batch-Snap-$(Get-Date -f yyyyMMdd)" -Memory $false -Confirm:$false
    Disconnect-VIServer -Confirm:$false
}
```

---

## 유용한 원라이너 / Useful One-Liners

```powershell
# 1. 모든 VM IP 주소 목록 / List all VM IP addresses
# SAFE
Get-VM | Select-Object Name, @{N="IP";E={$_.Guest.IPAddress -join ","}}

# 2. 전원 꺼진 VM 목록 / List powered-off VMs
Get-VM | Where-Object PowerState -eq "PoweredOff" | Select-Object Name, VMHost

# 3. CPU/메모리 사용률 상위 10개 VM / Top 10 VMs by CPU/memory usage
Get-VM | Sort-Object @{E={$_.ExtensionData.Summary.QuickStats.OverallCpuUsage}} -Descending | Select-Object -First 10 Name, @{N="CPU_MHz";E={$_.ExtensionData.Summary.QuickStats.OverallCpuUsage}}

# 4. VMware Tools 버전 전체 목록 / List VMware Tools versions
Get-VM | Select-Object Name, @{N="ToolsVersion";E={$_.Guest.ToolsVersion}}, @{N="ToolsStatus";E={$_.Guest.ExtensionData.ToolsRunningStatus}} | Sort-Object ToolsVersion

# 5. VMware Tools 미설치 VM / VMs without VMware Tools
Get-VM | Where-Object {$_.Guest.ToolsVersion -eq "0" -or $_.Guest.ToolsVersion -eq ""} | Select-Object Name

# 6. 고아 VMDK 파일 탐지 / Detect orphaned VMDK files
Get-VM | Get-HardDisk | Select-Object @{N="VM";E={$_.Parent.Name}}, Name, FileName, CapacityGB

# 7. 스냅샷 있는 VM 빠른 목록 / Quick list of VMs with snapshots
Get-VM | Get-Snapshot | Select-Object @{N="VM";E={$_.VM.Name}}, Name, SizeMB | Sort-Object SizeMB -Descending

# 8. 호스트별 VM 수 / VM count per host
Get-VMHost | Select-Object Name, @{N="VMCount";E={(Get-VM -Location $_).Count}} | Sort-Object VMCount -Descending

# 9. vCenter 이벤트 최근 50개 / Last 50 vCenter events
Get-VIEvent -MaxSamples 50 | Select-Object CreatedTime, UserName, FullFormattedMessage | Format-Table -Wrap

# 10. 전체 vCPU:pCPU 비율 계산 / Calculate vCPU:pCPU ratio
$vcpu = (Get-VM | Where-Object PowerState -eq "PoweredOn" | Measure-Object NumCpu -Sum).Sum
$pcpu = (Get-VMHost | Measure-Object NumCpu -Sum).Sum
Write-Host "vCPU:pCPU Ratio = $vcpu : $pcpu = $([math]::Round($vcpu/$pcpu,1)):1"

# 11. 데이터스토어 여유 공간 요약 / Datastore free space summary
Get-Datastore | Select-Object Name, @{N="FreeGB";E={[math]::Round($_.FreeSpaceGB,1)}}, @{N="FreePct";E={[math]::Round($_.FreeSpaceGB/$_.CapacityGB*100,1)}} | Sort-Object FreePct

# 12. HA가 비활성화된 클러스터 탐지 / Detect clusters with HA disabled
Get-Cluster | Where-Object {$_.HAEnabled -eq $false} | Select-Object Name

# 13. DRS가 비활성화된 클러스터 / Clusters with DRS disabled
Get-Cluster | Where-Object {$_.DrsEnabled -eq $false} | Select-Object Name

# 14. 특정 IP로 VM 찾기 / Find VM by IP address
Get-VM | Where-Object {$_.Guest.IPAddress -contains "10.10.10.50"}

# 15. 모든 VM에 적용된 태그 목록 / List tags applied to all VMs
Get-VM | ForEach-Object { $vm = $_; Get-TagAssignment -Entity $_ | Select-Object @{N="VM";E={$vm.Name}}, Tag }

# 16. VM 디스크 크기 전체 목록 / List all VM disk sizes
Get-VM | Get-HardDisk | Select-Object @{N="VM";E={$_.Parent.Name}}, Name, @{N="CapacityGB";E={[math]::Round($_.CapacityGB,1)}}

# 17. vMotion 이력 조회 / Query vMotion history
Get-VIEvent -MaxSamples 1000 | Where-Object {$_ -is [VMware.Vim.VmMigratedEvent]} | Select-Object CreatedTime, @{N="VM";E={$_.VM.Name}}, @{N="SourceHost";E={$_.SourceHost.Name}}, @{N="DestHost";E={$_.Host.Name}}

# 18. 할당된 CPU 대비 실제 사용률 / CPU reservation vs actual usage
Get-VM | Where-Object PowerState -eq "PoweredOn" | Select-Object Name, NumCpu, @{N="ReservationMHz";E={$_.ExtensionData.Config.CpuAllocation.Reservation}}, @{N="ActualMHz";E={$_.ExtensionData.Summary.QuickStats.OverallCpuUsage}}

# 19. 모든 호스트 NTP 동기 상태 / NTP sync status on all hosts
Get-VMHost | ForEach-Object { $h=$_; Get-VMHostService -VMHost $_ | Where-Object Key -eq "ntpd" | Select-Object @{N="Host";E={$h.Name}}, Running, Policy }

# 20. 전체 스토리지 사용량 요약 / Total storage usage summary
$total = (Get-Datastore | Measure-Object CapacityGB -Sum).Sum
$free  = (Get-Datastore | Measure-Object FreeSpaceGB -Sum).Sum
Write-Host "Total: $([math]::Round($total,1)) GB | Used: $([math]::Round($total-$free,1)) GB | Free: $([math]::Round($free,1)) GB ($([math]::Round($free/$total*100,1))%)"

# 21. 게스트 OS 배포 분포 / Guest OS distribution
Get-VM | Group-Object @{E={$_.Guest.OSFullName}} | Sort-Object Count -Descending | Select-Object Count, Name

# 22. 이름에 특정 문자열 포함 VM의 메모 확인 / Check notes on VMs matching a name pattern
Get-VM -Name "*web*" | Select-Object Name, Notes
```

---

## 트러블슈팅 / Troubleshooting

### 연결 오류 / Connection Errors

```powershell
# 문제: Connect-VIServer fails with certificate error
# 원인: Self-signed or expired certificate
# Problem: Certificate validation failure
# Cause: Self-signed or expired vCenter certificate
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Scope Session -Confirm:$false
Connect-VIServer -Server vcenter.example.com

# 문제: "Could not connect using the requested protocol"
# 원인: HTTPS/HTTP 프로토콜 불일치
# Problem: Protocol mismatch
# Fix: Explicitly specify protocol
Connect-VIServer -Server vcenter.example.com -Protocol https

# 문제: STS 인증서 만료로 PowerCLI 연결 실패
# Problem: PowerCLI login fails due to expired STS certificate
# 증상: "Cannot complete login due to an incorrect user name or password"
# Reference: certificate-management.md - STS Certificate Expiration section
Write-Host "Check STS certificate expiry on VCSA before attempting PowerCLI login"
```

### 타임아웃 처리 / Timeout Handling

```powershell
# 장시간 작업 타임아웃 증가 / Increase timeout for long operations
Set-PowerCLIConfiguration -WebOperationTimeoutSeconds 3600 -Confirm:$false

# 연결 유지 (장시간 스크립트) / Keep connection alive for long scripts
# 스크립트 중간에 주기적으로 vCenter 쿼리 실행 / Periodically query vCenter during long scripts
$keepAlive = Get-View ServiceInstance  # lightweight call to maintain session

# 세션 만료 후 재연결 패턴 / Reconnect pattern after session expiry
function Invoke-WithReconnect {
    param($Server, $Credential, $ScriptBlock)
    try {
        & $ScriptBlock
    } catch [VMware.VimAutomation.ViCore.Types.V1.ErrorHandling.InvalidLogin] {
        Write-Warning "Session expired, reconnecting..."
        Connect-VIServer -Server $Server -Credential $Credential | Out-Null
        & $ScriptBlock
    }
}
```

### 일반 오류 / Common Errors

| 오류 메시지 / Error Message | 원인 / Cause | 해결 / Resolution |
|---------------------------|-------------|-----------------|
| `Cannot complete login due to an incorrect user name or password` | 잘못된 자격증명 또는 만료된 STS 인증서 | 자격증명 확인; STS 인증서 점검 (`certificate-management.md`) |
| `The SSL connection could not be established` | 인증서 검증 실패 | `Set-PowerCLIConfiguration -InvalidCertificateAction Ignore` |
| `Operation timed out` | 네트워크 지연 또는 응답 없는 vCenter | `WebOperationTimeoutSeconds` 증가; vCenter 서비스 상태 확인 |
| `You do not have permission to perform this operation` | 권한 부족 | 역할 및 권한 확인; 관리자 계정으로 재시도 |
| `The object has already been deleted or has not been completely created` | 오래된 객체 참조 | cmdlet 재실행으로 최신 객체 참조 갱신 |
| `Get-VM : 10/24/2025 ... A parameter cannot be found that matches parameter name 'Location'` | PowerCLI 버전 불일치 | `Update-Module VMware.PowerCLI` 로 업데이트 |

### 디버깅 도구 / Debugging Tools

```powershell
# 상세 오류 출력 활성화 / Enable verbose error output
$VerbosePreference = "Continue"
$DebugPreference = "Continue"

# API 호출 추적 / Trace API calls
Set-PowerCLIConfiguration -DisplayDeprecationWarnings $true -Confirm:$false

# 마지막 오류 상세 확인 / Inspect last error in detail
$Error[0] | Format-List * -Force

# PowerCLI 모듈 상태 확인 / Check PowerCLI module health
Get-Module VMware.* | Select-Object Name, Version, Path | Format-Table -AutoSize
```

---

## References

| Resource | URL |
|----------|-----|
| VMware PowerCLI Documentation | [https://developer.vmware.com/powercli](https://developer.vmware.com/powercli) |
| PowerCLI User Guide (latest) | [https://developer.vmware.com/docs/powercli/latest/](https://developer.vmware.com/docs/powercli/latest/) |
| PowerShell Gallery - VMware.PowerCLI | [https://www.powershellgallery.com/packages/VMware.PowerCLI](https://www.powershellgallery.com/packages/VMware.PowerCLI) |
| PowerCLI Release Notes | [https://developer.vmware.com/powercli/release-notes](https://developer.vmware.com/powercli/release-notes) |
| PowerCLI Community Blog | [https://blogs.vmware.com/PowerCLI](https://blogs.vmware.com/PowerCLI) |
| VMware Code PowerCLI Samples | [https://code.vmware.com/samples](https://code.vmware.com/samples) |
