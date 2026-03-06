# VMware Tools Management

> Reference: [Broadcom KB 340](https://kb.vmware.com/s/article/340), [KB 2150799](https://kb.vmware.com/s/article/2150799), [KB 2129825](https://kb.vmware.com/s/article/2129825), [KB 2007849](https://kb.vmware.com/s/article/2007849)

---

## 1. 개요 / Overview

### 한국어

VMware Tools는 게스트 운영체제(Guest OS) 내에 설치되는 드라이버 및 서비스 패키지입니다. vSphere 플랫폼과 게스트 OS 간의 통신을 담당하며, 없으면 VM 성능이 크게 저하됩니다.

**VMware Tools가 제공하는 기능:**
- 향상된 네트워크 드라이버 (VMXNET3)
- 향상된 스토리지 드라이버 (PVSCSI)
- 게스트 OS 시간 동기화 (NTP 보조)
- 정상적인 전원 끄기 / 재시작 (graceful shutdown)
- 스냅샷 퀴싱 (VSS, pre-freeze/post-thaw 스크립트)
- 게스트 OS 정보 보고 (IP, OS 유형, 메모리 사용량)
- Drag-and-drop, copy-paste (vSphere Client ↔ VM)
- Guest OS Customization (Sysprep, cloud-init)

### English

VMware Tools is a suite of utilities installed in the guest OS that enables communication between the hypervisor and the guest, improves performance, and enables management features.

**Without VMware Tools:**
- VM network performance degrades (falls back to E1000 emulated NIC)
- Graceful shutdown from vCenter does not work (hard power-off only)
- Snapshot quiescing unavailable (application-inconsistent backups)
- Guest IP address not visible in vCenter inventory
- Memory balloon driver inactive (reduced memory overcommit efficiency)

---

## 2. 버전 호환성 / Version Compatibility

### Tools Version vs vSphere Version Matrix

| VMware Tools Version | vSphere 7.0 | vSphere 6.7 | vSphere 6.5 | Notes |
|---------------------|:-----------:|:-----------:|:-----------:|-------|
| **12.4.x** | Supported | Supported | Limited | Latest as of 2024 |
| **12.3.x** | Supported | Supported | Supported | |
| **12.2.x** | Supported | Supported | Supported | |
| **11.3.x** | Supported | Supported | Supported | Min for vSphere 7.0 |
| **10.3.x** | Compatible | Supported | Supported | Legacy |
| **10.1.x** | Compatible | Compatible | Supported | EOL |

> **Compatibility Rule**: VMware Tools N-1 (one major version older than ESXi) is fully supported. Newer Tools versions than the ESXi host are generally safe but unsupported.

### Tools 12.x Lifecycle

```
VMware Tools 12.x (introduced with vSphere 7.0 U3):
- Decoupled from ESXi — updated independently via VMware Tools releases
- Distributed via CDROM ISO, OVA, or vLCM (vSphere Lifecycle Manager)
- For Linux: open-vm-tools package updated via OS package manager
- Security updates provided for 18 months after GA release
```

### Checking Current Tools Version

```bash
# PowerCLI: Check Tools version for all VMs
Get-VM | Select-Object Name,
    @{N="ToolsVersion";E={$_.Guest.ToolsVersion}},
    @{N="ToolsStatus";E={$_.Guest.ExtensionData.ToolsStatus}},
    @{N="ToolsRunning";E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object ToolsVersion

# Filter for VMs with outdated tools
Get-VM | Where-Object { $_.Guest.ExtensionData.ToolsStatus -eq "toolsOld" } |
    Select-Object Name, @{N="ToolsVer";E={$_.Guest.ToolsVersion}}

# Inside guest VM (Windows):
# Control Panel → Programs → VMware Tools
# Or: sc query vmtoolsd

# Inside guest VM (Linux):
vmware-toolsd --version
# Or:
/usr/bin/vmware-toolsd --version
```

---

## 3. 설치 및 업그레이드 / Installation & Upgrade

### Windows — MSI-Based Installation

```powershell
# Method 1: Via vSphere Client (interactive)
# Right-click VM → Guest OS → Install VMware Tools
# This mounts the VMware Tools ISO to the VM's CD-ROM drive

# Method 2: Silent install via MSI (from mounted ISO)
# Inside Windows VM, after ISO is mounted (D: or E:):
D:\setup64.exe /s /v "/qn REBOOT=ReallySuppress"

# Silent install with specific components:
D:\setup64.exe /s /v "/qn REBOOT=ReallySuppress ADDLOCAL=ALL REMOVE=Hgfs,MUI"

# Silent upgrade (preserves existing config):
D:\setup64.exe /s /v "/qn REBOOT=ReallySuppress REINSTALL=ALL REINSTALLMODE=vomus"

# Unattended install log:
D:\setup64.exe /s /v "/qn /L*v C:\vmtools-install.log"

# Verify installation (PowerShell):
Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "*VMware Tools*" }
```

```powershell
# Method 3: PowerCLI — trigger Tools upgrade on all VMs
Get-VM | Where-Object { $_.Guest.ExtensionData.ToolsStatus -eq "toolsOld" } |
    ForEach-Object {
        Write-Host "Upgrading tools on: $($_.Name)"
        Update-Tools -VM $_ -NoReboot
    }
```

### Linux — open-vm-tools vs Bundled VMware Tools

**Recommended for Linux: open-vm-tools (distro-maintained packages)**

```bash
# RHEL / CentOS / Rocky Linux 8+:
dnf install open-vm-tools
systemctl enable --now vmtoolsd

# RHEL / CentOS 7:
yum install open-vm-tools
systemctl enable --now vmtoolsd

# Ubuntu / Debian:
apt-get install open-vm-tools
# For desktop VMs with GUI:
apt-get install open-vm-tools-desktop
systemctl enable --now open-vm-tools

# SLES / openSUSE:
zypper install open-vm-tools
systemctl enable --now vmtoolsd

# Verify:
vmware-toolsd --version
systemctl status vmtoolsd
```

```bash
# Update open-vm-tools via package manager:
# RHEL/CentOS:
dnf update open-vm-tools

# Ubuntu:
apt-get update && apt-get upgrade open-vm-tools
```

### Automated Deployment at Scale

```bash
# PowerCLI: Mount Tools ISO and trigger upgrade on all powered-on Windows VMs
$vms = Get-VM | Where-Object { $_.PowerState -eq "PoweredOn" -and
                                $_.Guest.OSFullName -like "*Windows*" -and
                                $_.Guest.ExtensionData.ToolsStatus -ne "toolsOk" }

foreach ($vm in $vms) {
    Write-Host "Processing: $($vm.Name)"
    Update-Tools -VM $vm -NoReboot
    Start-Sleep -Seconds 10  # Throttle to avoid vCenter overload
}
```

---

## 4. open-vm-tools vs VMware Tools (Bundled)

### Comparison

| Feature | open-vm-tools | VMware Tools (Bundled ISO) |
|---------|:-------------:|:--------------------------:|
| Source | Distro package repos | VMware ISO (mounted via vCenter) |
| Update method | OS package manager (yum/apt) | vCenter UI or PowerCLI |
| Kernel module compatibility | Distro-compiled (best compatibility) | VMware-compiled |
| Supported on vSphere 7.0 | Yes (recommended) | Yes |
| Available for Windows | No | Yes (only option) |
| VMware Tools version parity | Tracks open-source release | Matches vSphere bundle |

### When to Use Which

| Scenario | Recommendation |
|----------|---------------|
| Modern Linux (RHEL 8, Ubuntu 20.04+) | open-vm-tools |
| Legacy Linux with custom kernel | Bundled VMware Tools (better kernel module control) |
| All Windows guests | Bundled VMware Tools (no alternative) |
| Air-gapped environments | Bundled VMware Tools (no internet repo access) |
| Container-optimized Linux (Photon, Flatcar) | open-vm-tools (pre-installed) |

### Distro-Specific Package Names

| Distribution | Package Name |
|--------------|-------------|
| RHEL / CentOS / Rocky / AlmaLinux | `open-vm-tools` |
| Ubuntu / Debian | `open-vm-tools`, `open-vm-tools-desktop` |
| SLES / openSUSE | `open-vm-tools` |
| Photon OS | Pre-installed |
| FreeBSD | `open-vm-tools-nox11` (ports) |
| Flatcar Container Linux | Pre-installed (subset) |

---

## 5. 주요 드라이버 / Key Drivers

### PVSCSI (Paravirtual SCSI)

PVSCSI는 VMware가 설계한 고성능 스토리지 어댑터로, 에뮬레이션 없이 하이퍼바이저와 직접 통신합니다.

```
Performance comparison (approximate):
LSI Logic SAS:  ~150,000 IOPS max
PVSCSI:         ~1,000,000+ IOPS max (limited by storage backend)
```

```powershell
# Check SCSI controller type via PowerCLI
Get-VM "MyVM" | Get-ScsiController | Select-Object Name, Type

# Add PVSCSI controller to existing VM (VM must be powered off):
$vm = Get-VM "MyVM"
New-ScsiController -VM $vm -Type ParaVirtual

# Recommendation: Use PVSCSI for all production VMs except Windows Server 2003 or older
# Windows Server 2008+ supports PVSCSI natively with VMware Tools
```

### VMXNET3 (Paravirtual Network Adapter)

```powershell
# Check NIC adapter type
Get-VM | Get-NetworkAdapter | Select-Object VM, Name, Type

# Change NIC to VMXNET3 (VM must be powered off):
$vm = Get-VM "MyVM"
$nic = Get-NetworkAdapter -VM $vm
Set-NetworkAdapter -NetworkAdapter $nic -Type Vmxnet3 -Confirm:$false

# VMXNET3 features:
# - 10 Gbps throughput (E1000 limited to ~1 Gbps)
# - TCP Segmentation Offload (TSO)
# - Large Receive Offload (LRO)
# - VXLAN offload support
# - RSS (Receive Side Scaling) for multi-queue
```

### Balloon Driver (vmmemctl)

메모리 풍선 드라이버는 vSphere 메모리 오버커밋(memory overcommit)의 핵심 메커니즘입니다.

The balloon driver is the primary mechanism for memory reclamation in vSphere when the host is under memory pressure.

```
Memory Reclamation Techniques (priority order):
1. Transparent Page Sharing (TPS)   — share identical pages across VMs
2. Ballooning (vmmemctl)            — guest OS reclaims its own idle pages
3. Swapping                         — ESXi swaps guest memory to .vswp file (costly)
4. Memory Compression               — compress pages before swapping

# Check balloon driver activity (esxtop on ESXi host):
esxtop
# Press 'm' for memory view
# MCTL column shows ballooned memory per VM (in MB)
# High MCTL + high SWP = memory contention — add RAM or reduce VM density
```

```bash
# Check balloon driver status inside Linux guest:
cat /proc/vmmemctl
# Or:
vmware-toolsd --cmd "info-get guestinfo.vmtools.vmmemctl"

# Windows: Check in Task Manager → Performance → Memory
# "VMware Memory Control Driver" in Device Manager
```

### SVGA Driver (Display)

```
SVGA Driver provides:
- Hardware-accelerated 2D/3D graphics
- Dynamic screen resolution (resize VM console window)
- VRAM management (up to 128 MB configurable)

# Recommendation: Keep SVGA driver current for Horizon/VDI environments
# Legacy SVGA driver causes display corruption in some Windows 11 guests
```

---

## 6. Guest OS Customization

### Windows — Sysprep Integration

Guest OS Customization for Windows uses Microsoft Sysprep to generalize the OS (remove SIDs, reset machine name).

```powershell
# Prerequisites:
# - VMware Tools installed and running
# - Sysprep files present on vCenter (auto-included for supported Windows versions)
# - Template VM must NOT be domain-joined

# Create Customization Specification (PowerCLI):
$spec = New-OSCustomizationSpec `
    -Name "Windows2022-Spec" `
    -OSType Windows `
    -FullName "Administrator" `
    -OrgName "LabOrg" `
    -ChangeSid `
    -AdminPassword "SecurePass123!" `
    -AutoLogonCount 1 `
    -Workgroup "WORKGROUP"

# Add NIC settings (DHCP):
Get-OSCustomizationNicMapping -OSCustomizationSpec $spec |
    Set-OSCustomizationNicMapping -IpMode UseDhcp

# Apply spec when cloning:
New-VM -Name "NewVM" -Template "Win2022-Template" `
       -Datastore "Datastore01" -OSCustomizationSpec $spec

# Sysprep log location (inside guest after customization):
# C:\Windows\System32\Sysprep\Panther\setupact.log
# C:\Windows\Panther\UnattendGC\setupact.log
```

### Linux — cloud-init Integration

```bash
# cloud-init customization requires:
# - open-vm-tools installed
# - cloud-init package installed in template
# - Template VM has cloud-init configured to read VMware datasource

# Install cloud-init with VMware datasource:
# RHEL/CentOS:
dnf install cloud-init
# Ubuntu:
apt-get install cloud-init

# Configure cloud-init datasource (in template):
cat /etc/cloud/cloud.cfg.d/99-vmware.cfg
# Add:
# datasource_list: [ VMware ]

# Reset cloud-init for fresh customization at clone time:
cloud-init clean --logs
```

### Common Customization Failures

| Symptom | Root Cause | Resolution |
|---------|-----------|------------|
| Customization stuck at "Waiting for customization" | VMware Tools not running | Verify `vmtoolsd` service is running |
| "Sysprep failed" in vCenter events | Sysprep files missing or corrupt | Check vCenter Sysprep directory |
| Linux VM keeps original hostname | cloud-init not configured | Install/configure cloud-init |
| IP not assigned after clone | NIC customization spec misconfigured | Verify customization spec NIC settings |
| Windows domain join fails | DNS unreachable during customization | Verify DNS in customization spec |

```bash
# vCenter Sysprep files location (vCenter 7.0):
# /etc/vmware-vpx/sysprep/ on VCSA

# Check customization log on VCSA:
tail -f /var/log/vmware/vpxd/vpxd.log | grep -i "customiz"

# Check customization log inside Windows guest:
# C:\Windows\TEMP\vmware-imc\guestcust.log
```

---

## 7. 퀴싱 / Quiescing for Backups

### Windows — VSS (Volume Shadow Copy Service)

VSS 퀴싱은 애플리케이션이 일관된 상태로 백업될 수 있도록 I/O를 일시 중단하고 버퍼를 플러시합니다.

VSS quiescing freezes application I/O and flushes write buffers, ensuring application-consistent snapshots for backup.

```
VSS Quiescing Flow:
  1. Backup software → vCenter API → CreateSnapshot (quiesced=true)
  2. VMware Tools (VSS Requester) → signals VSS writers
  3. VSS writers (SQL, Exchange, etc.) flush buffers and freeze I/O
  4. Snapshot taken
  5. VSS writers resume (thaw)
  6. Snapshot descriptor returned to backup software
```

```powershell
# Check VSS writer status before backup (Windows guest):
vssadmin list writers

# Expected state for all writers: State: [1] Stable
# Problematic states:
#   [5] Waiting for completion  → writer hung
#   [7] Failed                  → writer failed

# Reset hung VSS writer (example: SQL Server VSS Writer):
net stop "SQLWriter"
net start "SQLWriter"

# Full VSS reset (use if multiple writers failed):
net stop vss
net stop swprv
net start swprv
net start vss
```

### Linux — Pre-Freeze / Post-Thaw Scripts

Linux에는 VSS가 없으므로 VMware Tools는 스냅샷 전후에 커스텀 스크립트를 실행합니다.

```bash
# Script locations (inside Linux guest):
# Pre-freeze (runs BEFORE snapshot):
/etc/vmware/backupScripts.d/*.freeze

# Post-thaw (runs AFTER snapshot):
/etc/vmware/backupScripts.d/*.thaw

# Example: MySQL freeze/thaw scripts
cat > /etc/vmware/backupScripts.d/mysql.freeze << 'EOF'
#!/bin/bash
mysql -u root -pPassword -e "FLUSH TABLES WITH READ LOCK; FLUSH LOGS;"
EOF

cat > /etc/vmware/backupScripts.d/mysql.thaw << 'EOF'
#!/bin/bash
mysql -u root -pPassword -e "UNLOCK TABLES;"
EOF

chmod +x /etc/vmware/backupScripts.d/mysql.freeze
chmod +x /etc/vmware/backupScripts.d/mysql.thaw

# Test scripts manually before relying on backup:
/etc/vmware/backupScripts.d/mysql.freeze
# Verify DB is locked, then:
/etc/vmware/backupScripts.d/mysql.thaw
```

### Quiescing Failure Diagnosis

```bash
# Check quiescing failure in vCenter events:
# vSphere Client → Monitor → Events → filter "quiesce"

# Common quiescing failure codes:
# Error 3 (FREEZE_FAILED): Pre-freeze script failed or VSS writer failed
# Error 6 (THAW_FAILED): Post-thaw script failed

# VMware Tools log for quiescing (inside Windows guest):
# C:\ProgramData\VMware\VMware Tools\vmware-vmsvc.log

# VMware Tools log for quiescing (Linux guest):
tail -f /var/log/vmware-tools/vmware-vmsvc.log | grep -i "quiesc\|freeze\|thaw"
```

---

## 8. 트러블슈팅 / Troubleshooting

### VMware Tools Not Running

```bash
# Check Tools status from vCenter:
Get-VM | Where-Object { $_.Guest.ExtensionData.ToolsRunningStatus -ne "guestToolsRunning" } |
    Select-Object Name, @{N="Status";E={$_.Guest.ExtensionData.ToolsRunningStatus}}

# Windows: Restart VMware Tools service
# Inside guest (PowerShell):
Restart-Service -Name "VMTools"
# Or via Services MMC: vmtoolsd

# Linux: Restart open-vm-tools
systemctl restart vmtoolsd
# Check status:
systemctl status vmtoolsd

# If service fails to start (Linux — open-vm-tools):
journalctl -u vmtoolsd --since "10 minutes ago"
# Common fix: reinstall package
dnf reinstall open-vm-tools
```

### VMware Tools Out of Date

```bash
# Identify all VMs with outdated tools (PowerCLI):
Get-VM | Select-Object Name,
    @{N="ToolsVersion";E={$_.Guest.ToolsVersion}},
    @{N="ToolsStatus";E={$_.Guest.ExtensionData.ToolsStatus}} |
    Where-Object { $_.ToolsStatus -ne "toolsOk" } |
    Export-Csv C:\tools-status.csv -NoTypeInformation

# Trigger silent upgrade (Windows VMs, PowerCLI):
Get-VM | Where-Object { $_.Guest.ExtensionData.ToolsStatus -eq "toolsOld" -and
                         $_.PowerState -eq "PoweredOn" } |
    ForEach-Object { Update-Tools -VM $_ -NoReboot }
```

### Installation Failures

```bash
# Windows: VMware Tools install fails with error 1603 (MSI failure)
# Resolution:
# 1. Remove previous version via Programs and Features
# 2. Clear temp files: del /f /s /q %TEMP%\*
# 3. Reboot and retry install
# 4. Check: C:\Windows\Temp\vminst.log

# Linux: open-vm-tools fails to start (kernel module issue)
# Check:
dmesg | grep vmware
modinfo vmw_vmci
# Rebuild kernel modules:
# RHEL/CentOS:
dnf install kernel-devel kernel-headers
/etc/vmware-tools/installer.sh install  # Only for bundled tools

# Ubuntu (DKMS auto-rebuilds on kernel update):
dpkg-reconfigure open-vm-tools
```

### Time Sync Issues

```bash
# Symptom: Guest VM clock drifts or jumps unexpectedly
# Root cause: Conflict between VMware Tools time sync and NTP (chrony/ntpd)

# Best practice for Linux: Use NTP/chrony, DISABLE VMware Tools time sync
# VMware Tools time sync should only be a fallback

# Disable VMware Tools time sync (Linux):
vmware-toolsd --cmd "synctime.enable=0"
# Or edit /etc/vmware-tools/tools.conf:
cat >> /etc/vmware-tools/tools.conf << 'EOF'
[vmtools]
disable-tools-sync-time=true
EOF

# Verify chrony is running and syncing:
chronyc tracking
chronyc sources -v

# Windows: VMware Tools time sync is acceptable if no domain NTP
# For domain-joined VMs: let Windows Time (w32tm) handle sync
# Disable Tools time sync on domain-joined Windows VMs:
# VMware Tools tray → Options → Uncheck "Synchronize guest time with host"

# Check time sync status from ESXi host:
esxcli system settings advanced list -o /tools/syncTime
```

### Drag-and-Drop / Copy-Paste Not Working

```bash
# Requires: VMware Tools running + vSphere Client (HTML5)
# Note: Drag-and-drop only works in VMRC (VMware Remote Console), NOT HTML5 web console

# Enable copy-paste (if disabled by security policy):
# Add to VM's .vmx file:
# isolation.tools.copy.disable = "FALSE"
# isolation.tools.paste.disable = "FALSE"

# Check VMX settings via PowerCLI:
$vm = Get-VM "MyVM"
$vm.ExtensionData.Config.ExtraConfig | Where-Object { $_.Key -like "*isolation*" }

# Enable via PowerCLI:
$spec = New-Object VMware.Vim.VirtualMachineConfigSpec
$spec.ExtraConfig = @(
    New-Object VMware.Vim.OptionValue -Property @{Key="isolation.tools.copy.disable";Value="FALSE"},
    New-Object VMware.Vim.OptionValue -Property @{Key="isolation.tools.paste.disable";Value="FALSE"}
)
(Get-VM "MyVM").ExtensionData.ReconfigVM($spec)
```

---

## 9. vLCM을 통한 Tools 관리 / Tools Management via vLCM

### Overview

vSphere Lifecycle Manager (vLCM) 7.0 이상에서 VMware Tools를 클러스터 전체에 걸쳐 일관되게 관리할 수 있습니다.

vLCM allows centralized VMware Tools lifecycle management across clusters, ensuring consistent Tools versions without manual per-VM upgrades.

### Enabling Tools Management in vLCM

```
vSphere Client → Hosts & Clusters → Select Cluster
→ Updates → VMware Tools → Manage VMware Tools

Prerequisites:
- Cluster must be managed by vLCM Images (not Baselines)
- All hosts must be in vLCM image compliance
- VMware Tools component must be added to the cluster image
```

### Cluster-Wide Tools Upgrade

```bash
# PowerCLI: Check Tools compliance across a cluster
$cluster = Get-Cluster "Production-Cluster"
$cluster | Get-VM | Select-Object Name,
    @{N="ToolsVersion";E={$_.Guest.ToolsVersion}},
    @{N="ToolsStatus";E={$_.Guest.ExtensionData.ToolsStatus}} |
    Sort-Object ToolsVersion | Format-Table -AutoSize

# Via vSphere Client:
# 1. Cluster → Updates → VMware Tools
# 2. "Check Compliance" — identifies VMs with outdated tools
# 3. "Upgrade" — initiates rolling upgrade across cluster VMs
#    (VMs are upgraded without requiring vMotion or downtime, guest restart may be needed)
```

### vLCM Image with Tools Component

```
Cluster Image Components:
├── ESXi base image (e.g., ESXi 7.0 U3n)
├── Vendor add-ons (HPE, Dell drivers)
├── Components (firmware, NIC drivers)
└── VMware Tools component (optional — for Tools ISO management)

# To add Tools to cluster image:
# Cluster → Updates → Image → Edit → Add Component
# Search: "VMware Tools"
# Select desired version → Save
# Run Remediate to push to all hosts (updates Tools ISO on hosts)
```

### Tools Upgrade Automation via vLCM API

```python
# Python example using vSphere Automation SDK
# Trigger VMware Tools upgrade on all non-compliant VMs in a cluster

from vmware.vapi.vsphere.client import create_vsphere_client
import requests

session = requests.session()
session.verify = False
client = create_vsphere_client(
    server="vcenter.lab.local",
    username="administrator@vsphere.local",
    password="Password1!",
    session=session
)

# List VMs with outdated tools
filter_spec = client.vcenter.VM.FilterSpec()
vms = client.vcenter.VM.list(filter_spec)

for vm in vms:
    tools_info = client.vcenter.vm.Tools.get(vm.vm)
    if tools_info.upgrade_policy == "UPGRADE_AT_POWER_CYCLE":
        print(f"VM {vm.name}: Tools will upgrade at next power cycle")
    elif tools_info.version_status == "UNMANAGED":
        print(f"VM {vm.name}: open-vm-tools (unmanaged)")
```

---

## 10. Broadcom 패키지 저장소 구조 / Broadcom Package Repository Structure

> Reference: [VMware Tools version-mapping file](https://packages-prod.broadcom.com/tools/versions), [KB 368758](https://knowledge.broadcom.com/external/article/368758/downloading-vmware-tools.html), [KB 313876](https://knowledge.broadcom.com/external/article/313876/installing-and-upgrading-the-latest-vers.html)

### 10.1 저장소 전체 구조 / Repository Layout

Broadcom은 `packages-prod.broadcom.com/tools/` 에서 VMware Tools 패키지를 배포합니다. 세 가지 경로가 있으며, 용도가 명확히 구분됩니다.

```
https://packages-prod.broadcom.com/tools/
├── esx/{version}/          ← Bundled VMware Tools (레거시 OS 전용 패키지 repo)
│   ├── repos/              ← repo 설정 RPM/DEB (RHEL6, SLES11, Ubuntu 10~12 전용)
│   ├── rhel6/              ← RHEL 6 RPM 패키지
│   ├── sles11sp{0-4}/      ← SLES 11 SP0~SP4 RPM 패키지
│   ├── ubuntu/dists/       ← Ubuntu 10.04~12.04 DEB 패키지
│   └── windows/            ← Windows ISO
│
├── releases/{version}/     ← VMware Tools ISO 릴리스 (Windows ISO + 서명 파일)
│   └── 12.5.4/
│       ├── VMware-tools-windows-12.5.4-24964629.iso
│       ├── VMware-tools-windows-arm-12.5.4-24964629.iso
│       └── (*.sha, *.sig 검증 파일)
│
├── keys/                   ← GPG 패키지 서명 키
│   ├── VMWARE-PACKAGING-GPG-RSA-KEY.pub
│   └── VMWARE-PACKAGING-GPG-DSA-KEY.pub
│
├── open-vm-tools/          ← ARM tech preview만 존재
│   └── ovt-arm-tech-preview/
│
└── versions                ← ESXi 빌드 ↔ Tools 버전 매핑 파일
```

### 10.2 esx/ 경로의 OS 지원 범위 / Supported OS in esx/ Path

`esx/{version}/` 경로는 **레거시 Linux 배포판 전용**이며, 현대 배포판(RHEL 8+, Ubuntu 20.04+, SLES 15+)용 패키지는 포함하지 않습니다.

| esx/ 하위 경로 | 대상 OS | 현재 상태 |
|----------------|---------|-----------|
| `rhel6/` | RHEL 6 (x86_64, i386) | EOL — 레거시 전용 |
| `sles11sp{0-4}/` | SLES 11 SP0~SP4 | EOL — 레거시 전용 |
| `ubuntu/dists/` | Ubuntu 10.04 (lucid), 11.04 (natty), 11.10 (oneiric), 12.04 (precise) | EOL — 레거시 전용 |
| `windows/` | Windows (전 버전) | 활성 |
| `repos/` | 위 레거시 OS에 대한 repo 설정 RPM/DEB | 레거시 전용 |

> **주의**: `esx/8.0p08/repos/`에 접근하면 RHEL6, SLES11, Ubuntu 10~12용 repo 설정 패키지만 존재합니다. RHEL 8/9, Ubuntu 20.04+ 등 현대 배포판 패키지는 없습니다.

### 10.3 ESXi 버전별 경로 매핑 / ESXi Version Path Mapping

`esx/` 아래의 전체 ESXi 버전 디렉토리:

| ESXi 계열 | 사용 가능 경로 |
|-----------|---------------|
| 7.0 | `7.0`, `7.0u1`, `7.0u2`, `7.0u3`, `7.0p01`~`7.0p10` |
| 8.0 | `8.0`, `8.0u1`, `8.0u2`, `8.0u3`, `8.0p01`~`8.0p08` |
| 9.0 | `9.0`, `9.0.1.0`, `9.0.2.0` |
| 공통 | `latest` (최신 버전 심볼릭 링크) |

### 10.4 releases/ 경로 — VMware Tools ISO 릴리스 / ISO Releases

`releases/` 경로에는 VMware Tools ISO(주로 Windows용)와 서명 파일이 배포됩니다.

```
releases/ 에서 확인된 12.x 버전:
12.0.0, 12.0.5, 12.0.6, 12.1.0, 12.1.5, 12.2.0, 12.2.5, 12.2.6,
12.3.0, 12.3.5, 12.4.0, 12.4.5, 12.4.6, 12.4.7, 12.4.8, 12.4.9,
12.5.0, 12.5.1, 12.5.2, 12.5.3, 12.5.4

최신 13.x:
13.0.0, 13.0.1, 13.0.5, 13.0.10
```

### 10.5 VMware Tools 12.5.4 버전 정보 / Version Details

| 항목 | 값 |
|------|-----|
| **VMware Tools 버전** | 12.5.4 |
| **내부 버전 코드** | 12452 |
| **빌드 번호** | 24964629 |
| **번들 ESXi** | 8.0p07 (build 25067014), 8.0p08 (build 25205845) |
| **open-vm-tools 태그** | `stable-12.5.4` (GitHub) |
| **보안 수정** | CVE-2025-41244, CVE-2025-41246 (VMSA-2025-0015) |
| **릴리스 날짜** | 2025-09-30 |
| **32-bit Windows** | VMware Tools 12.4.9로 포함 |

### 10.6 VMware Tools vs open-vm-tools 빌드 주체 비교 / Build Origin Comparison

VMware Tools와 open-vm-tools는 **동일 소스코드**(github.com/vmware/open-vm-tools)를 기반으로 하지만, 빌드 주체와 패치 주기가 다릅니다.

| 항목 | Broadcom 빌드 (releases/ ISO) | Distro 빌드 (dnf/apt/zypper) |
|------|:---:|:---:|
| **빌드 주체** | Broadcom/VMware | Red Hat, Canonical, SUSE |
| **패키지 형태** | ISO (Windows), 레거시 RPM/DEB | OS 네이티브 RPM/DEB |
| **패치 주기** | VMware Tools 릴리스 주기 (빠름) | Distro 릴리스 주기 (보수적, backport) |
| **버전** | 최신 (예: 12.5.4) | Distro 고정 (예: RHEL 9 → 12.2.x + backport) |
| **커널 호환** | VMware 테스트 범위 | Distro 커널 최적화 |
| **보안 패치** | VMware CVE 직접 릴리스 | Distro backport (느릴 수 있음) |
| **지원 채널** | Broadcom/VMware 지원 | OS 벤더 지원 |

### 10.7 현대 Linux 배포판 설치 경로 / Installation Path for Modern Linux

Broadcom 공식 권고: **Linux은 OS 벤더의 open-vm-tools 패키지를 사용하라.**

```
[GitHub: vmware/open-vm-tools]
       stable-12.5.4 태그 (소스 공개)
              │
    ┌─────────┼──────────┬──────────┐
  Red Hat   Canonical    SUSE     기타 벤더
  자체 빌드   자체 빌드   자체 빌드   자체 빌드
    │          │          │          │
  RHEL repo  Ubuntu repo SLES repo  ...
  (dnf)      (apt)       (zypper)
```

```bash
# RHEL 8/9, Rocky, AlmaLinux
dnf info open-vm-tools              # 현재 제공 버전 확인
dnf update open-vm-tools            # 업그레이드

# Ubuntu 22.04 / 24.04
apt-cache policy open-vm-tools      # 현재 제공 버전 확인
apt-get update && apt-get upgrade open-vm-tools

# SLES 15
zypper info open-vm-tools
zypper refresh && zypper update open-vm-tools
```

### 10.8 CVE 긴급 패치 — Distro 미반영 시 / Emergency CVE Patching

Distro가 아직 12.5.4를 반영하지 않았으나 CVE-2025-41244/41246 패치가 긴급한 경우:

```bash
# 방법 1: GitHub 소스 빌드
git clone -b stable-12.5.4 https://github.com/vmware/open-vm-tools.git
cd open-vm-tools/open-vm-tools
autoreconf -fi
./configure --without-kernel-modules
make && sudo make install

# 방법 2: CVE 패치만 backport (기존 버전 유지)
# Broadcom 제공 패치 브랜치:
git clone -b CVE-2025-41244.patch https://github.com/vmware/open-vm-tools.git
# 기존 open-vm-tools SRPM/소스에 패치 적용 후 재빌드
```

### 10.9 에어갭 환경 내부 미러링 / Air-Gapped Environment Mirroring

인터넷이 차단된 에어갭 환경에서는 내부 미러 서버를 통해 배포합니다.

#### 방법 A: reposync + Nginx (RPM 배포판)

```bash
# [Bastion 서버] 인터넷 연결 가능한 서버에서 동기화
dnf install -y yum-utils createrepo_c

# 레거시 Broadcom repo 동기화 (RHEL6/SLES11 필요 시)
reposync --repoid=vmware-tools-8p08 \
  --download-path=/data/mirror/vmware-tools/8.0p08/x86_64 \
  --download-metadata
createrepo_c /data/mirror/vmware-tools/8.0p08/x86_64

# 현대 배포판: Distro repo에서 open-vm-tools 패키지 다운로드
dnf download open-vm-tools --resolve --destdir=/data/mirror/ovt-pkgs/  # RHEL 8/9
createrepo_c /data/mirror/ovt-pkgs/

# GPG 키 저장
curl -o /data/mirror/vmware-tools/RPM-GPG-KEY-VMWARE \
  https://packages-prod.broadcom.com/tools/keys/VMWARE-PACKAGING-GPG-RSA-KEY.pub

# [내부망] tar + 물리 매체 반입
tar czf vmware-tools-mirror-$(date +%Y%m%d).tar.gz -C /data/mirror .
# USB/DVD → 내부망 미러 서버로 반입 후:
tar xzf vmware-tools-mirror-*.tar.gz -C /var/www/html/vmware-tools/

# Nginx 서빙
cat > /etc/nginx/conf.d/vmware-tools.conf << 'EOF'
server {
    listen 80;
    server_name mirror.internal.company.com;
    root /var/www/html;
    autoindex on;
    location /vmware-tools/ { autoindex on; }
}
EOF
systemctl enable --now nginx
```

#### 방법 B: apt-mirror (Ubuntu/Debian)

```bash
# [Bastion 서버]
apt-get install -y apt-mirror

# Distro repo에서 open-vm-tools 다운로드
apt-get download open-vm-tools                                    # Ubuntu
# 또는 GitHub 소스 tarball
wget https://github.com/vmware/open-vm-tools/archive/refs/tags/stable-12.5.4.tar.gz

# [내부망] 반입 후 설치
dpkg -i /path/to/open-vm-tools_*.deb
```

#### 방법 C: Nexus Repository Manager (엔터프라이즈)

```
RPM + DEB 동시 관리, RBAC 접근 제어, 감사 로그 지원
Nexus UI → Repositories → Create Repository
  - yum (hosted): vmware-tools
  - apt (hosted): vmware-tools-apt
패키지 업로드 후 클라이언트에서 Nexus URL로 repo 설정
```

#### 미러링 방법 비교

| 항목 | Nginx + reposync | apt-mirror | Nexus |
|------|:---:|:---:|:---:|
| 설정 난이도 | 낮음 | 낮음 | 중간 |
| RPM + DEB 동시 | 별도 구성 | DEB만 | 모두 지원 |
| 접근 제어(RBAC) | 없음 | 없음 | 있음 |
| 감사 로그 | 없음 | 없음 | 있음 |
| 권장 환경 | 소규모 단일 OS | Ubuntu 중심 | 엔터프라이즈 다중 OS |

### 10.10 권장 사항 요약 / Recommendation Summary

| 상황 | 권장 설치 경로 | 이유 |
|------|---------------|------|
| 일반 프로덕션 Linux | Distro 기본 repo (`dnf`/`apt`/`zypper`) | OS 벤더가 커널과 함께 테스트, 자동 관리 |
| VMware CVE 긴급 패치 | GitHub 소스 빌드 (`stable-12.5.4`) | Distro backport보다 빠른 패치 적용 |
| VMware 기술지원(SR) 요청 시 | Broadcom 빌드 사용 | VMware 지원팀이 자사 빌드 기준 분석 |
| OS 벤더 지원계약 중심 | Distro 기본 repo | Red Hat/Canonical/SUSE 지원팀은 자사 빌드만 공식 지원 |
| 레거시 OS (RHEL 6, SLES 11) | Broadcom `esx/` repo | 레거시 OS용 유일한 경로 |
| Windows 게스트 | `releases/12.5.4/` ISO | Windows는 ISO 설치만 가능 |
| 에어갭 환경 | 내부 미러 (Nginx/Nexus) | 외부 인터넷 차단 시 |

> **주의: Broadcom repo와 Distro repo를 동시에 활성화하면 버전 충돌 발생 가능.**
> 하나만 활성화하거나, Distro repo에서 `exclude=open-vm-tools*`로 제외 설정 필요.

---

## 11. References / 참고자료

| Resource | Description | URL |
|----------|-------------|-----|
| KB 340 | VMware Tools release and build numbers | https://kb.vmware.com/s/article/340 |
| KB 2150799 | VMware Tools compatibility matrix | https://kb.vmware.com/s/article/2150799 |
| KB 2129825 | open-vm-tools support for Linux | https://kb.vmware.com/s/article/2129825 |
| KB 2007849 | Guest OS customization requirements | https://kb.vmware.com/s/article/2007849 |
| KB 1018722 | Disabling VMware Tools time sync | https://kb.vmware.com/s/article/1018722 |
| KB 2107796 | VMware Tools quiescing failures | https://kb.vmware.com/s/article/2107796 |
| KB 2146192 | PVSCSI driver performance best practices | https://kb.vmware.com/s/article/2146192 |
| KB 1001805 | VMXNET3 adapter overview | https://kb.vmware.com/s/article/1001805 |
| KB 304809 | Build numbers and versions of VMware Tools | https://knowledge.broadcom.com/external/article/304809 |
| KB 313456 | VMware support for open-vm-tools | https://knowledge.broadcom.com/external/article/313456 |
| KB 313876 | Manually installing/upgrading VMware Tools on hosts | https://knowledge.broadcom.com/external/article/313876 |
| KB 368758 | Downloading VMware Tools | https://knowledge.broadcom.com/external/article/368758 |
| VMSA-2025-0015 | VMware Tools CVE-2025-41244/41246 | https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/tools/12-5-0/release-notes/vmware-tools-1254-release-notes.html |
| VMware Tools 12.5.4 Release Notes | Release notes for Tools 12.5.4 | https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/tools/12-5-0/release-notes/vmware-tools-1254-release-notes.html |
| Broadcom Tools version-mapping | ESXi build ↔ Tools version mapping file | https://packages-prod.broadcom.com/tools/versions |
| Broadcom Tools releases | VMware Tools ISO downloads | https://packages-prod.broadcom.com/tools/releases/ |
| Broadcom Tools GPG keys | Package signing keys (RSA/DSA) | https://packages-prod.broadcom.com/tools/keys/ |
| VMware Tools Docs | Official VMware Tools documentation | https://docs.vmware.com/en/VMware-Tools/ |
| open-vm-tools GitHub | open-vm-tools source and releases | https://github.com/vmware/open-vm-tools |
