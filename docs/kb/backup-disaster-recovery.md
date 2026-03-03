# vSphere 7.0 Backup & Disaster Recovery

> Reference: [Broadcom KB 2147289](https://kb.vmware.com/s/article/2147289), [KB 2057795](https://kb.vmware.com/s/article/2057795), [KB 2006849](https://kb.vmware.com/s/article/2006849), [KB 84650](https://kb.vmware.com/s/article/84650)

---

## 1. 개요 / Overview

### 한국어

vSphere 7.0 환경에서의 백업 및 재해 복구(DR) 전략은 VM 레벨, vCenter 레벨, 사이트 레벨의 세 계층으로 구성됩니다.

| 계층 | 솔루션 | RPO | RTO |
|------|--------|-----|-----|
| VM 레벨 | VADP 기반 백업 (Veeam, Commvault 등) | 분 ~ 시간 | 분 ~ 시간 |
| vCenter 레벨 | VAMI File-Based Backup | 1일 (스케줄) | 2~4시간 |
| 사이트 레벨 | vSphere Replication + SRM | 분 (최소 5분) | 분 ~ 수십 분 |

### English

Backup and DR strategy for vSphere 7.0 spans three tiers: VM-level backup via VADP, vCenter appliance backup via VAMI, and site-level DR via vSphere Replication and SRM.

**Key Principles:**
- Never rely solely on snapshots as a backup method
- Test restore procedures quarterly — untested backups are not backups
- Separate backup traffic onto a dedicated VMkernel port or VLAN
- Store backup repositories off-site or in a separate fault domain

---

## 2. VADP (vStorage APIs for Data Protection)

### Framework Overview

VADP is VMware's official API framework that allows third-party backup software to integrate natively with vSphere without requiring agents inside each VM.

```
Backup Flow:
  Backup Server
      │
      ├── vCenter API (create snapshot, query CBT)
      │
      ├── Storage Layer (read disk data via transport mode)
      │       ├── SAN/HotAdd — direct LUN access (fastest)
      │       ├── NBD — network block device over VMkernel (safe fallback)
      │       └── NBDSSL — encrypted NBD
      │
      └── vCenter API (delete snapshot, record CBT cursor)
```

### Transport Modes

| Mode | Description | Requirements | Performance |
|------|-------------|--------------|-------------|
| **SAN (Fibre Channel/iSCSI)** | Backup proxy reads LUN directly | Proxy must have SAN access | Highest |
| **HotAdd** | Proxy VM mounts guest VMDK | Proxy VM on same datastore | High |
| **NBD** | Data over TCP via ESXi host | Any network connectivity | Moderate |
| **NBDSSL** | Encrypted NBD | Any network connectivity | Lower |

### How Backup Vendors Use VADP

```
1.  Backup job starts
2.  Backup software calls vCenter API → CreateSnapshot (quiesced=true if VSS)
3.  vCenter coordinates snapshot creation on ESXi host
4.  VADP returns snapshot descriptor + disk extents
5.  Backup software calls QueryChangedDiskAreas (CBT) → gets changed blocks
6.  Data transferred via chosen transport mode
7.  Backup software calls vCenter API → DeleteSnapshot
8.  CBT cursor advanced to new change ID
```

### VADP Prerequisites

```bash
# Verify VADP-required ports are open on ESXi firewall
esxcli network firewall ruleset list | grep -E "nfc|vSphere"

# Check ESXi host version (VADP requires vSphere 4.0+)
esxcli system version get

# Verify vCenter permissions for backup service account
# Required privileges:
#   VirtualMachine.State.CreateSnapshot
#   VirtualMachine.State.RemoveSnapshot
#   VirtualMachine.Provisioning.DiskRandomAccess
#   VirtualMachine.Provisioning.DiskRandomRead
#   Global.DisableMethods
#   Global.EnableMethods
```

---

## 3. CBT (Changed Block Tracking)

### How CBT Works

CBT (Changed Block Tracking)는 VMDK에서 마지막 백업 이후 변경된 디스크 블록만 추적하여 증분 백업 성능을 크게 향상시킵니다.

CBT tracks which 512KB-aligned disk sectors have changed since the last backup checkpoint. This enables incremental and differential backups that transfer only changed data, dramatically reducing backup windows and storage consumption.

**CBT Architecture:**
- Stored in `<vmname>-ctk.vmdk` files alongside each VMDK
- Change IDs are opaque cursors (e.g., `52 0 1234567890 6 0 ...`)
- QueryChangedDiskAreas API returns a list of changed extents

### Enabling CBT

```bash
# Method 1: Via PowerCLI (recommended for bulk operations)
# Enable CBT on a single VM
$vm = Get-VM "MyVM"
$spec = New-Object VMware.Vim.VirtualMachineConfigSpec
$spec.changeTrackingEnabled = $true
$vm.ExtensionData.ReconfigVM($spec)

# Enable CBT on all VMs in a cluster
Get-Cluster "Production" | Get-VM | ForEach-Object {
    $spec = New-Object VMware.Vim.VirtualMachineConfigSpec
    $spec.changeTrackingEnabled = $true
    $_.ExtensionData.ReconfigVM($spec)
}

# Verify CBT status
Get-VM | Select Name, @{N="CBT";E={$_.ExtensionData.Config.ChangeTrackingEnabled}}
```

```bash
# Method 2: Edit VMX directly (VM must be powered off)
# Add to .vmx file:
#   ctkEnabled = "TRUE"
#   scsi0:0.ctkEnabled = "TRUE"   # adjust disk identifier
```

> **NOTE**: CBT requires a snapshot cycle to activate after enabling. Take and delete a snapshot after enabling CBT.

### Resetting CBT (When Corrupt)

CBT 손상 증상: 증분 백업이 항상 전체 백업 크기와 같거나, 백업 소프트웨어가 "invalid change ID" 오류를 반환.

Corrupt CBT symptoms: incremental backups are the same size as full backups, or backup software reports "invalid change ID" errors.

```bash
# PowerCLI: Reset CBT on a VM
# Step 1: Disable CBT
$vm = Get-VM "MyVM"
$spec = New-Object VMware.Vim.VirtualMachineConfigSpec
$spec.changeTrackingEnabled = $false
$vm.ExtensionData.ReconfigVM($spec)

# Step 2: Take and delete a snapshot (forces CTK file removal)
$snap = New-Snapshot -VM $vm -Name "CBT-Reset-Temp" -Confirm:$false
Remove-Snapshot -Snapshot $snap -Confirm:$false

# Step 3: Re-enable CBT
$spec.changeTrackingEnabled = $true
$vm.ExtensionData.ReconfigVM($spec)

# Step 4: Take and delete another snapshot (activates new CTK)
$snap = New-Snapshot -VM $vm -Name "CBT-Activate-Temp" -Confirm:$false
Remove-Snapshot -Snapshot $snap -Confirm:$false

# Step 5: Run a new full backup to establish a clean CBT baseline
```

### CBT and SESparse Disks

- SESparse (Space-Efficient Sparse) is the default format for snapshots on VMFS-6 datastores
- CBT is **fully supported** with SESparse snapshot disks in vSphere 7.0
- Hardware-accelerated CBT (XCOPY) requires vSphere 7.0 U1+ and compatible storage arrays

### QueryChangedDiskAreas API

```python
# Python example using pyVmomi
from pyVmomi import vim
from pyVim.connect import SmartConnect

si = SmartConnect(host="vcenter.lab.local", user="admin@vsphere.local", pwd="Password1!")
vm = si.content.searchIndex.FindByDnsName(dnsName="myvm.lab.local", vmSearch=True)

# Get snapshot for CBT query
snapshot = vm.snapshot.currentSnapshot

# Query changed areas since changeId "0" (full backup baseline)
# changeId "0" returns all allocated sectors (first full backup)
changed = vm.QueryChangedDiskAreas(
    snapshot=snapshot,
    deviceKey=2000,       # SCSI 0:0 disk key
    startOffset=0,
    changeId="0"
)

for area in changed.changedArea:
    print(f"Offset: {area.start}, Length: {area.length}")
```

---

## 4. 스냅샷 기반 백업 / Snapshot-Based Backup

### Best Practices

| 항목 / Item | 권장사항 / Recommendation |
|------------|--------------------------|
| 스냅샷 보존 기간 / Snapshot retention | 백업 완료 후 즉시 삭제 / Delete immediately after backup |
| 최대 스냅샷 수 / Max snapshot chain depth | 3개 이하 (운영), 1개 (백업 중) / ≤3 (production), 1 (during backup) |
| 스냅샷 디스크 크기 / Snapshot disk growth | 원본 VMDK의 20% 공간 여유 확보 / Maintain 20% free space per VMDK |
| 메모리 스냅샷 / Memory snapshot | 백업에 불필요 — 사용 금지 / Not needed for backup — avoid |
| 퀴싱 / Quiescing | DB 서버에만 사용 (성능 영향) / Use only for DB servers (performance impact) |

### Snapshot Impact on Performance

스냅샷이 활성화된 동안 VM의 I/O는 snapshot delta disk로 리다이렉션됩니다. 장기 스냅샷은 다음 문제를 유발합니다.

While a snapshot is active, VM I/O is redirected to a delta (snapshot) disk. Long-lived snapshots cause:

- **Write amplification**: Every write requires updating the delta file and potentially the redo log
- **Read penalty**: Reads may traverse multiple delta files in a chain
- **Consolidation stun**: Committing large deltas causes VM I/O stun (seconds to minutes for large disks)
- **Datastore exhaustion**: Delta disks can grow to the size of the base VMDK

```bash
# Check for VMs with snapshots older than 24 hours (PowerCLI)
Get-VM | Get-Snapshot | Where-Object { $_.Created -lt (Get-Date).AddHours(-24) } |
    Select-Object VM, Name, Created, @{N="SizeGB";E={[math]::Round($_.SizeGB,2)}} |
    Sort-Object Created
```

### Stun Time During Snapshot Operations

| Operation | Stun Duration | Notes |
|-----------|--------------|-------|
| CreateSnapshot (no quiesce) | < 1 second | I/O redirect setup |
| CreateSnapshot (quiesced, Windows VSS) | 2–30 seconds | VSS provider processing |
| DeleteSnapshot (small delta, <10GB) | < 5 seconds | Fast consolidation |
| DeleteSnapshot (large delta, >50GB) | 30 sec – several minutes | Monitor with esxtop |
| Consolidation (orphaned delta) | Extended stun possible | Schedule in maintenance window |

```bash
# Monitor snapshot consolidation via esxtop
# SSH to ESXi host during consolidation:
esxtop
# Press 'v' for VM view, look for CMDS/s drop indicating stun

# Check if consolidation is needed
Get-VM | Where-Object { $_.ExtensionData.Runtime.ConsolidationNeeded -eq $true }
```

### Consolidation Requirements

```bash
# Force consolidation via PowerCLI
$vm = Get-VM "MyVM"
$vm.ExtensionData.ConsolidateVMDisks_Task()

# Via vSphere Client: Right-click VM → Snapshots → Consolidate
# Schedule during low I/O period for large VMs
```

---

## 5. vCenter 백업 / vCenter Backup (VAMI File-Based)

### Overview

VCSA 7.0은 VAMI(VMware Appliance Management Interface)를 통해 파일 기반 백업을 지원합니다. 이 백업은 vCenter 구성, 인증서, 인벤토리 데이터를 포함합니다.

VCSA 7.0 supports file-based backup via VAMI. This backup captures vCenter configuration, certificates, and inventory database (VCDB). It does NOT capture guest VM data.

**Backup Contents:**
- vCenter PostgreSQL database (VCDB) — inventory, permissions, alarms
- SSO configuration and certificate store (vmdir)
- vCenter configuration files
- vSphere Lifecycle Manager database

**NOT included:**
- Guest VM disks/data (use VADP backup for VMs)
- vCenter log files
- Custom scripts in /tmp

### Accessing VAMI Backup

```
URL: https://<vcenter-fqdn>:5480
Navigate: Backup → Configure
```

### Supported Backup Protocols

| Protocol | URL Format | Notes |
|----------|-----------|-------|
| FTP | `ftp://server/path` | Unencrypted — avoid in production |
| FTPS | `ftps://server/path` | Encrypted FTP |
| HTTP | `http://server/path` | Unencrypted |
| HTTPS | `https://server/path` | Recommended |
| SCP | `scp://server/path` | SSH-based, recommended for Linux targets |
| NFS | `nfs://server/export/path` | Direct NFS mount |
| SMB | `smb://server/share/path` | Windows share |

### Configuring Scheduled Backup

```bash
# VAMI UI Steps:
# 1. Login to https://<vcenter>:5480
# 2. Navigate: Backup → Configure Backup
# 3. Set:
#    - Backup Location: scp://backup-server/vcsa-backups
#    - Username / Password for backup destination
#    - Number of backups to retain: 14 (recommended)
#    - Encryption password (optional but recommended)
# 4. Enable Schedule:
#    - Frequency: Daily
#    - Time: 02:00 (off-peak)
# 5. Click Save

# Verify via API:
curl -u 'administrator@vsphere.local:Password1!' \
  -k https://<vcenter>:5480/api/appliance/recovery/backup/schedules \
  -H 'Content-Type: application/json'
```

### Backup Location Requirements

- Minimum free space: **3x the VCDB size** (check with `du -sh /storage/db/` on VCSA)
- Typical VCDB size: 5–20 GB for small environments, up to 100 GB for large
- Each backup creates a timestamped directory: `M_<timestamp>_<vc-version>/`

```bash
# Check VCDB size on VCSA (SSH as root)
du -sh /storage/db/
df -h /storage/db

# Check last backup status via API
curl -u 'administrator@vsphere.local:Password1!' \
  -k https://<vcenter>:5480/api/appliance/recovery/backup/job/details
```

### vCenter Restore Procedure

> **WARNING**: Restore overwrites the current vCenter state. Only perform on a failed or corrupt vCenter. Restoring to the same IP/FQDN is critical.

```bash
# Step 1: Deploy a fresh VCSA from ISO
# (Use the same version as the backup — version must match exactly)

# Step 2: During Stage 2 of VCSA installer, select "Restore"
# - Provide backup location and credentials
# - Enter encryption password if backup was encrypted
# - Target FQDN/IP must match the original vCenter

# Step 3: Installer restores VCDB and SSO from backup
# Duration: 30–120 minutes depending on database size

# Step 4: Post-restore validation
service-control --status --all
/usr/lib/vmware-vmafd/bin/vmafd-cli get-ls-location --server-name localhost

# Step 5: Verify host connectivity
# Hosts should reconnect automatically. If not:
# vSphere Client → Host → Actions → Connection → Reconnect
```

---

## 6. vSphere Replication

### Appliance Deployment

vSphere Replication Appliance (VRA)는 보호 사이트와 복구 사이트 양쪽에 배포해야 합니다.

```
Protection Site                    Recovery Site
┌─────────────────┐               ┌─────────────────┐
│ vCenter + VRA   │──Replication──│ vCenter + VRA   │
│ Source VMs      │               │ Replica VMs     │
└─────────────────┘               └─────────────────┘
```

**Deployment Steps:**
1. Deploy VRA OVA from vSphere Client → Hosts & Clusters → Deploy OVF
2. Register VRA: vSphere Client → Site Recovery → Open Site Recovery
3. Pair sites: Configure → Sites → Pair Sites (exchange PSC lookupservice URLs)

### RPO Configuration

| RPO Setting | Use Case | Network Bandwidth Required |
|-------------|----------|--------------------------|
| 5 minutes | Tier-1 critical VMs | High (near-continuous sync) |
| 1 hour | Standard production VMs | Moderate |
| 24 hours | Dev/Test VMs | Low |

```bash
# Minimum RPO: 5 minutes (vSphere Replication 8.x / vSphere 7.0)
# Maximum RPO: 24 hours

# Bandwidth estimation formula:
# Required BW (Mbps) = (Changed data per RPO interval in MB × 8) / (RPO in seconds × 0.7)
# Example: 10 GB change rate per hour, RPO = 1 hour
# = (10240 × 8) / (3600 × 0.7) = 32.5 Mbps minimum
```

### Replication Monitoring

```bash
# Check replication status via PowerCLI with SRM SDK
# Or check vSphere Client → Site Recovery → Replications

# VRA logs location (SSH to VRA appliance):
tail -f /var/log/vmware/hbr/hbrsrv.log

# Common replication status states:
# Active        — replication running normally
# Error         — check hbrsrv.log for root cause
# Idle          — paused or completed initial sync
# Syncing       — initial full sync in progress
```

### Planned Migration vs DR Failover

| Feature | Planned Migration | DR Failover |
|---------|------------------|-------------|
| Source VM state | Powered off gracefully | Any state (may be powered off abruptly) |
| Data loss | Zero (synchronizes to RPO=0 before cutover) | Up to configured RPO |
| Reverse replication | Automatic after migration | Manual reconfiguration |
| Use case | Scheduled maintenance, datacenter move | Disaster, unplanned outage |

```bash
# Planned Migration Steps (via SRM or vSphere Replication standalone):
# 1. Verify replication is Active and lag is within RPO
# 2. vSphere Client → Site Recovery → Replications → Select VM → Migrate
# 3. Source VM powers off, final delta synced, replica powers on
# 4. Update DNS/load balancer to point to recovery site

# DR Failover Steps:
# 1. vSphere Client → Site Recovery → Replications → Select VM → Recover
# 2. Select recovery point (latest or specific snapshot)
# 3. Replica powers on with last synced state
```

---

## 7. Site Recovery Manager (SRM) 기초 / SRM Basics

### Architecture

```
Protection Site vCenter ←──── SRM Server ────→ Recovery Site vCenter
                                   │
                          Replication (vSphere Replication or
                          Array-Based Replication via SRA)
```

**SRM Components:**
- **SRM Server**: Plugin deployed on vCenter (VCSA-embedded in SRM 8.x)
- **SRA (Storage Replication Adapter)**: Array-specific plugin for array-based replication
- **vSphere Replication**: Built-in replication option (no SRA needed)

### Protection Groups

```
Protection Group Types:
├── vSphere Replication-based     — VM granularity, any storage
└── Array-Based Replication (ABR) — LUN granularity, consistent point-in-time
```

```bash
# PowerCLI: List protection groups (requires SRM SDK)
Connect-SrmServer -SrmServerAddress "srm.site1.local" -Credential $cred
$srm = $global:DefaultSrmServers[0].ExtensionData
$srm.Protection.ListProtectionGroups() | Select-Object Info
```

### Recovery Plans

Recovery Plan = ordered sequence of protection groups + VM power-on sequencing + IP customization.

**Key Settings:**
- **VM Dependencies**: Define boot order (DB server before app server)
- **IP Customization**: Pre-configure IP remapping for recovery site network
- **Recovery Steps**: Pre/post-power-on scripts for application validation

### Test Failover (Non-Disruptive)

```bash
# Test failover creates isolated bubble network — production is NOT affected
# Steps via vSphere Client:
# 1. Site Recovery → Recovery Plans → Select plan
# 2. Test → Run Test
# 3. SRM powers on replica VMs in isolated test network
# 4. Validate application functionality
# 5. Cleanup Test → removes test VMs, retains replication state

# Schedule quarterly test failovers to validate RTOs
```

---

## 8. 백업 제품 통합 이슈 / Backup Product Integration Issues

### Veeam Backup & Replication

#### VADP Timeout Errors

**Symptoms**: `Failed to open VDDK transport connection`, backup job fails at 0%

```bash
# Root cause: ESXi host NFC service overloaded or network timeout
# Resolution:
# 1. Increase VDDK timeout in Veeam job settings → Advanced → Storage → NFC timeout
# 2. Check ESXi hostd.log for NFC errors:
grep -i "nfc\|timeout" /var/log/hostd.log | tail -50

# 3. Restart NFC service (ESXi SSH):
/etc/init.d/hostd restart

# 4. Verify backup proxy can reach ESXi host on port 902 (NFC):
nc -zv <esxi-host-ip> 902
```

#### CBT Errors

**Symptoms**: `Failed to query changed disk areas`, incremental backup falls back to full

```bash
# Resolution: Reset CBT (see Section 3)
# Veeam-specific: Enable "Disable changed block tracking" in job settings
# to force full backup, then re-enable CBT

# Veeam log location (Windows proxy):
# C:\ProgramData\Veeam\Backup\<Job Name>\<date>.log
```

#### Hot-Add Transport Mode Issues

**Symptoms**: Hot-add proxy cannot mount VM disks, falls back to NBD

```bash
# Common causes:
# 1. Backup proxy VM on different cluster/datastore than source VMs
# 2. vSAN datastore — hot-add requires proxy VM also on vSAN
# 3. Encrypted VMs — hot-add not supported with VM Encryption

# Check proxy VM datastore compatibility:
# Proxy VM must have access to the same datastore as the source VM

# Veeam: Set transport mode to "Automatic" to allow fallback to NBD
```

### Commvault

#### Quiescing Failures

**Symptoms**: `Failed to quiesce the virtual machine`, backup completes without application consistency

```bash
# Diagnosis on guest VM (Windows):
# Check VSS writers status:
vssadmin list writers
# Look for writers in "Failed" or "Waiting for completion" state

# Common failing VSS writers and fix:
# - SQL Server VSS Writer: restart MSSQLSERVER service
# - Registry Writer: restart VSS service
# - System Writer: system restart required

# Disable quiescing for problematic VMs (last resort):
# Commvault: VM group → Edit → Backup Options → Disable quiesce
```

### Dell (EMC) Networker / Avamar / PowerProtect

#### VADP Session Limits

```bash
# ESXi 7.0 default: max 52 concurrent NFC sessions per host
# Large backup windows may exhaust sessions

# Check current NFC sessions (ESXi SSH):
esxcli network connection list | grep 902 | wc -l

# Stagger backup jobs or increase parallelism limits in backup software
# ESXi does not support increasing the 52-session limit via configuration
```

---

## 9. 복구 절차 / Recovery Procedures

### VM-Level Recovery

```bash
# Full VM restore via backup software (Veeam example):
# 1. Open Veeam Console → Home → Restore → VMware VMs
# 2. Select restore point → Entire VM restore
# 3. Choose: Restore to original location (overwrites) or New location
# 4. Power-on restored VM and validate

# Via vSphere (from snapshot only — not a backup restore):
# Right-click VM → Snapshots → Revert to Snapshot
# WARNING: All changes since snapshot are lost
```

### File-Level Recovery (Guest File Restore)

```bash
# Windows: Veeam Instant File Level Recovery
# 1. Mount backup as virtual disk
# 2. Browse files via Windows Explorer
# 3. Copy specific files to destination

# Linux: Mount VMDK backup manually
# On Linux backup proxy:
vmware-mount /path/to/backup.vmdk /mnt/restore
ls /mnt/restore/
cp /mnt/restore/etc/important.conf /destination/
vmware-mount -d /mnt/restore
```

### Bare-Metal ESXi Recovery

```bash
# Scenario: ESXi host OS partition corrupted, VMs on shared storage intact

# Step 1: Boot from ESXi 7.0 installer ISO (USB or PXE)
# Step 2: Select "Install ESXi" — do NOT select "Upgrade"
# Step 3: Choose local disk (not the SAN/NFS datastore with VMs)
# Step 4: Set hostname, management IP, root password
# Step 5: Complete installation and reboot

# Step 6: Re-add host to vCenter
# vSphere Client → Hosts & Clusters → Right-click cluster → Add Host
# Enter IP/FQDN, root credentials

# Step 7: VMs on shared storage auto-discovered
# If not: Right-click datastore → Register VM → Browse for .vmx files

# Step 8: Restore host configuration (if backup exists)
# Via PowerCLI:
Set-VMHostFirmware -VMHost "esxi01.lab.local" -Restore -SourcePath "C:\esxi-backup\esxi01.tgz"

# Or restore via esxcli:
# esxcli system settings advanced set -o /UserVars/HostdStatsdPort -i 8182
```

### ESXi Configuration Backup

```bash
# Backup ESXi host configuration (PowerCLI)
$vmhost = Get-VMHost "esxi01.lab.local"
Get-VMHostFirmware -VMHost $vmhost -BackupConfiguration -DestinationPath "C:\esxi-backups\"

# Schedule regular ESXi config backups for all hosts:
Get-VMHost | ForEach-Object {
    $name = $_.Name.Split('.')[0]
    Get-VMHostFirmware -VMHost $_ -BackupConfiguration `
        -DestinationPath "C:\esxi-backups\$name-$(Get-Date -Format yyyyMMdd).tgz"
}
```

---

## 10. References / 참고자료

| Resource | Description | URL |
|----------|-------------|-----|
| KB 2147289 | VADP overview and transport modes | https://kb.vmware.com/s/article/2147289 |
| KB 2057795 | CBT reset procedure | https://kb.vmware.com/s/article/2057795 |
| KB 2006849 | vCenter file-based backup and restore | https://kb.vmware.com/s/article/2006849 |
| KB 84650 | vSphere Replication RPO and bandwidth | https://kb.vmware.com/s/article/84650 |
| KB 2135378 | Snapshot consolidation best practices | https://kb.vmware.com/s/article/2135378 |
| KB 2010202 | Quiesced snapshot failures | https://kb.vmware.com/s/article/2010202 |
| KB 1020128 | ESXi configuration backup | https://kb.vmware.com/s/article/1020128 |
| VDDK Programming Guide | QueryChangedDiskAreas API reference | https://developer.vmware.com/docs/11750/ |
| SRM 8.x Documentation | Site Recovery Manager configuration | https://docs.vmware.com/en/Site-Recovery-Manager/ |
