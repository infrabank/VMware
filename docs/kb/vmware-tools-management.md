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

## 10. References / 참고자료

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
| VMware Tools Docs | Official VMware Tools documentation | https://docs.vmware.com/en/VMware-Tools/ |
| open-vm-tools GitHub | open-vm-tools source and releases | https://github.com/vmware/open-vm-tools |
