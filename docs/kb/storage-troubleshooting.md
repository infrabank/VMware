# Storage Troubleshooting Guide

## APD (All Paths Down)

### Symptoms
- VMs become unresponsive
- Datastore shows as inaccessible
- vmkernel.log: `NMP: nmp_ThrottleLogForDevice: ... APD`

### Diagnostic Steps
```bash
# Check path status
esxcli storage core path list | grep -E "State|Device"

# Check adapter status
esxcli storage core adapter list

# Check device status
esxcli storage core device list

# Review vmkernel log for storage errors
grep -i "apd\|nmp\|scsi" /var/log/vmkernel.log | tail -50
```

### Resolution
1. **Check physical connectivity** — cables, HBA, switch ports
2. **Check storage array** — is it accessible from other hosts?
3. **Rescan storage**:
   ```bash
   esxcli storage core adapter rescan --all
   ```
4. **If paths recovered**, VMs should auto-resume (if APD handling is configured)

### APD Timeout Settings
```bash
# Check current APD settings
esxcli system settings advanced list -o /Misc/APDHandlingEnable
esxcli system settings advanced list -o /Misc/APDTimeout

# Default timeout: 140 seconds
# Adjust if needed (MEDIUM risk):
esxcli system settings advanced set -o /Misc/APDTimeout -i 200
```

---

## PDL (Permanent Device Loss)

### Symptoms
- More severe than APD — storage device permanently unavailable
- vmkernel.log: `ScsiDeviceIO: ... PDL` or SCSI sense code `0x5 0x25 0x0`
- VMs will be terminated if PDL handling is enabled

### Key Difference from APD
| | APD | PDL |
|---|---|---|
| **Nature** | Temporary — paths may recover | Permanent — device gone |
| **VM behavior** | Frozen, waiting for I/O | Killed (if PDL response configured) |
| **Recovery** | Fix paths, VMs resume | Re-present LUN, re-register VMs |

### Resolution
1. **Identify the failed device**:
   ```bash
   esxcli storage core device list | grep -B5 "dead\|off"
   ```
2. **Check SCSI sense codes in vmkernel.log** — confirms PDL vs transient
3. **Storage team**: Fix the LUN/array issue
4. **After LUN restored**: Rescan and re-register VMs

---

## VMFS Datastore Issues

### Datastore Not Visible After Rescan
```bash
# Rescan HBAs
esxcli storage core adapter rescan --all

# Check if VMFS volume is detected
esxcli storage vmfs extent list

# If volume is there but not mounted
esxcli storage vmfs snapshot list         # Check for snapshot/replica
esxcli storage vmfs snapshot mount -l <label>  # Mount snapshot volume
```

### VMFS Metadata Corruption
```bash
# Check VMFS integrity (LOW risk — read-only check)
voma -m vmfs -f check -d /vmfs/devices/disks/naa.xxx:1

# If errors found, repair (HIGH risk — maintenance mode required)
voma -m vmfs -f fix -d /vmfs/devices/disks/naa.xxx:1
```

### Expand VMFS Datastore
```bash
# List current extents
esxcli storage vmfs extent list

# Grow datastore to fill expanded LUN
esxcli storage vmfs growfs -d <device> -l <datastore-label>
# Or add extent (second LUN)
esxcli storage vmfs extent add -d <new-device> -l <datastore-label>
```

---

## vSAN Troubleshooting

### vSAN Health Check
```bash
# Via esxcli
esxcli vsan health cluster list

# Key health checks:
# - Network: multicast, vSAN VMkernel connectivity
# - Data: Objects health, rebuild status
# - Limits: Component count, max components per host
```

### Common vSAN Issues

#### Disk Group Failure
```bash
# Check disk status
esxcli vsan storage list

# Check for failed disks
esxcli vsan debug disk list | grep -i "unhealthy\|error"

# Remove failed disk (HIGH risk)
esxcli vsan storage remove -d <device-id>
```

#### vSAN Object Not Accessible
```bash
# Check object health
esxcli vsan debug object health summary get

# Find specific object
esxcli vsan debug object list | grep <vm-name>

# Check compliance
esxcli vsan policy getdefault
```

#### Network Partition
```bash
# Check vSAN network
esxcli vsan network list

# Test connectivity to other hosts
vmkping -I vmk1 <other-host-vsan-ip>  # Use vSAN VMkernel interface

# Check partition info
esxcli vsan cluster get
```

### vSAN Maintenance Mode Options
| Mode | Description | Risk |
|------|-------------|------|
| `ensureObjectAccessibility` | Minimal data migration | LOW — fastest |
| `evacuateAllData` | Full data migration | HIGH — slow, needs capacity |
| `noAction` | No data protection | CRITICAL — objects at risk |

```bash
esxcli system maintenanceMode set --enable true --vsanmode=ensureObjectAccessibility
```

---

## NFS Datastore Issues

### NFS Mount Failures
```bash
# Check current NFS mounts
esxcli storage nfs list

# Check VMkernel connectivity to NFS server
vmkping -I vmk0 <nfs-server-ip>

# Check firewall rules
esxcli network firewall ruleset list | grep -i nfs

# Enable NFS client firewall rule
esxcli network firewall ruleset set --ruleset-id=nfsClient --enabled=true
```

### NFS Performance
- Use NFS 4.1 with multipathing when possible
- Ensure jumbo frames if configured end-to-end
- Check for NFS locking issues in hostd.log

### Common NFS Errors
| Error | Cause | Fix |
|-------|-------|-----|
| `Unable to connect to NFS server` | Network/firewall | Check connectivity, exports |
| `Access denied by server` | Export permissions | Verify NFS exports include ESXi IPs |
| `Read-only file system` | Export is read-only | Change NFS export to rw |
| `Stale NFS handle` | NFS server restart | Remount datastore |

---

## SCSI Sense Codes Quick Reference

| Sense Key | ASC/ASCQ | Meaning |
|-----------|----------|---------|
| 0x0 | 0x0/0x0 | No error |
| 0x2 | 0x4/0x1 | Not ready, becoming ready |
| 0x2 | 0x4/0x3 | Not ready, manual intervention required |
| 0x3 | 0x11/0x0 | Medium error, unrecovered read |
| 0x4 | 0x44/0x0 | Hardware error, internal target failure |
| 0x5 | 0x20/0x0 | Illegal request, invalid command |
| 0x5 | 0x25/0x0 | **PDL — LUN not supported** |
| 0x6 | 0x28/0x0 | Unit attention, medium changed |
| 0x6 | 0x29/0x0 | Unit attention, device reset |
| 0x7 | 0x27/0x0 | Write protected |
| 0xB | 0x0/0x0 | Aborted command |

### Reference
- KB289902 — Understanding SCSI sense codes in ESXi
- KB2004684 — APD and PDL handling

---

## iSCSI Troubleshooting / iSCSI 문제 해결

### Overview / 개요
Software iSCSI adapter (vmhba65) is a VMkernel-based initiator that requires explicit VMkernel port binding for multipathing. Hardware iSCSI HBAs offload processing to the card and do not require port binding.

소프트웨어 iSCSI 어댑터는 VMkernel 기반 initiator로, 멀티패싱을 위해 명시적인 VMkernel 포트 바인딩이 필요합니다. 하드웨어 iSCSI HBA는 카드에서 처리를 오프로드하므로 포트 바인딩이 필요하지 않습니다.

### Software iSCSI Adapter Configuration / 소프트웨어 iSCSI 어댑터 설정
```bash
# Enable software iSCSI adapter / 소프트웨어 iSCSI 어댑터 활성화
esxcli iscsi software set --enabled=true

# Confirm adapter name (typically vmhba65) / 어댑터 이름 확인
esxcli iscsi adapter list

# Add dynamic discovery (SendTargets) / 동적 검색 추가
esxcli iscsi adapter discovery sendtarget add --adapter=vmhba65 --address=10.0.1.100

# Add static target / 정적 타겟 추가
esxcli iscsi adapter discovery staticentry add \
  --adapter=vmhba65 \
  --address=10.0.1.100 \
  --name=iqn.2024-01.com.example:storage01

# List discovered targets / 검색된 타겟 목록
esxcli iscsi adapter target list --adapter=vmhba65

# Check active sessions / 활성 세션 확인
esxcli iscsi session list

# Trigger discovery rescan / 검색 재스캔 트리거
esxcli storage core adapter rescan --adapter=vmhba65
```

### Network Port Binding / 네트워크 포트 바인딩
Required for multipathing with software iSCSI. Each VMkernel port should be on a dedicated physical NIC (vmnic) on the same or separate subnet as the iSCSI target network.

소프트웨어 iSCSI 멀티패싱에 필수입니다. 각 VMkernel 포트는 iSCSI 타겟 네트워크와 동일하거나 별도의 서브넷에 있는 전용 물리적 NIC(vmnic)에 있어야 합니다.

```bash
# Bind VMkernel adapter to iSCSI adapter / VMkernel 어댑터를 iSCSI 어댑터에 바인딩
esxcli iscsi networkportal add --adapter=vmhba65 --nic=vmk1
esxcli iscsi networkportal add --adapter=vmhba65 --nic=vmk2

# Verify bindings / 바인딩 확인
esxcli iscsi networkportal list --adapter=vmhba65

# Remove a binding / 바인딩 제거
esxcli iscsi networkportal remove --adapter=vmhba65 --nic=vmk2

# Check compliance (warns if NIC is shared or not dedicated) / 컴플라이언스 확인
esxcli iscsi networkportal compliance check --adapter=vmhba65
```

### CHAP Authentication / CHAP 인증
```bash
# Set unidirectional CHAP (initiator authenticates to target)
# 단방향 CHAP 설정 (initiator가 target에 인증)
esxcli iscsi adapter auth chap set \
  --adapter=vmhba65 \
  --direction=uni \
  --authname=initiator1 \
  --secret=MyChapSecret12 \
  --level=required

# Set Mutual CHAP (both sides authenticate)
# 양방향 CHAP 설정 (양측 모두 인증)
esxcli iscsi adapter auth chap set \
  --adapter=vmhba65 \
  --direction=mutual \
  --authname=target1 \
  --secret=TargetSecret12 \
  --level=required

# Verify CHAP settings / CHAP 설정 확인
esxcli iscsi adapter auth chap get --adapter=vmhba65

# Set CHAP per-target (overrides adapter-level) / 타겟별 CHAP 설정
esxcli iscsi adapter target auth chap set \
  --adapter=vmhba65 \
  --target=iqn.2024-01.com.example:storage01 \
  --direction=uni \
  --authname=initiator1 \
  --secret=MyChapSecret12 \
  --level=required
```

**CHAP Secret Requirements / CHAP 시크릿 요구사항:**
- Minimum 12 characters, maximum 16 characters / 최소 12자, 최대 16자
- Initiator and target secrets must be different for Mutual CHAP / Mutual CHAP의 경우 Initiator와 Target 시크릿은 달라야 함

### Common iSCSI Issues / 일반적인 iSCSI 문제

| Symptom / 증상 | Likely Cause / 원인 | Resolution / 해결 방법 |
|----------------|---------------------|------------------------|
| Login timeout — no paths after add | VMkernel not bound to iSCSI adapter | Run `esxcli iscsi networkportal add` and rescan |
| CHAP mismatch — login rejected | Secret mismatch or direction mismatch | Verify secret and direction (uni vs mutual) on both sides |
| No paths after host reboot | Port binding not persistent; binding lost | Re-add bindings; verify with `networkportal list` after reboot |
| Duplicate targets in list | Both dynamic and static entries configured | Remove static entry if dynamic discovery covers it |
| iSCSI login fails intermittently | MTU mismatch (jumbo frames partially enabled) | Verify end-to-end MTU: `vmkping -s 8972 -d -I vmk1 <target-ip>` |
| Slow iSCSI performance | Round Robin not configured; single path used | Switch PSP to VMW_PSP_RR and set `--iops=1` |

### Log Locations / 로그 위치
- iSCSI login/logout events: `/var/log/vmkernel.log` — search for `iscsi`, `login`, `logout`
- CHAP failures: `/var/log/vmkernel.log` — search for `CHAP` or `Authentication failed`
- Path state changes: `/var/log/vmkernel.log` — search for `NMP` and adapter name

### Reference / 참조
- KB1003971 — Configuring software iSCSI in ESXi
- KB1016305 — Network port binding for software iSCSI
- KB2036610 — iSCSI CHAP authentication configuration

---

## Multipathing Policy Guide / 멀티패싱 정책 가이드

### Overview / 개요
ESXi uses the Native Multipathing Plugin (NMP) framework with two sub-components: the Storage Array Type Plugin (SATP) that handles array-specific behavior, and the Path Selection Plugin (PSP) that determines which path to use for I/O.

ESXi는 Native Multipathing Plugin(NMP) 프레임워크를 사용하며, 어레이별 동작을 처리하는 SATP(Storage Array Type Plugin)와 I/O에 사용할 경로를 결정하는 PSP(Path Selection Plugin)의 두 가지 하위 구성 요소로 이루어져 있습니다.

### Path Selection Policies (PSP) / 경로 선택 정책

| Policy | Name | Use Case / 사용 사례 | Default For |
|--------|------|----------------------|-------------|
| VMW_PSP_FIXED | Fixed | Single preferred path; failover to alternate on failure. Preferred path defined explicitly. / 단일 우선 경로, 장애 시 대체 경로로 전환 | Most ALUA-aware arrays (Active/Optimized preferred) |
| VMW_PSP_MRU | Most Recently Used | Stays on the last working path after failover; does not return to original. / 장애 후 마지막으로 사용된 경로 유지 | Non-ALUA arrays (Active/Active) |
| VMW_PSP_RR | Round Robin | Active load balancing across all active paths. / 모든 활성 경로에 걸쳐 로드 밸런싱 | Not default; must be configured manually |

### Checking Current Paths and Policy / 현재 경로 및 정책 확인
```bash
# List all devices with current PSP / 모든 디바이스와 현재 PSP 목록
esxcli storage nmp device list

# Check specific device / 특정 디바이스 확인
esxcli storage nmp device list -d naa.6000c29xxxxxxxxxxxxxx

# List all paths for a device / 디바이스의 모든 경로 목록
esxcli storage nmp path list -d naa.6000c29xxxxxxxxxxxxxx

# Check SATP assignment / SATP 할당 확인
esxcli storage nmp satp list
```

### Changing PSP / PSP 변경
```bash
# Change to Round Robin for a specific device / 특정 디바이스를 Round Robin으로 변경
# RISK: MODERATE — affects I/O path selection immediately
esxcli storage nmp device set --device=naa.6000c29xxxxxxxxxxxxxx --psp=VMW_PSP_RR

# Change Round Robin I/O operations limit (default: 1000 I/Os per path switch)
# Setting to 1 gives per-I/O round robin — recommended for modern all-flash arrays
# Round Robin I/O 작업 한도 변경 (기본값: 경로 전환당 1000 I/O)
esxcli storage nmp psp roundrobin deviceconfig set \
  --device=naa.6000c29xxxxxxxxxxxxxx \
  --iops=1 \
  --type=iops

# Verify Round Robin config / Round Robin 설정 확인
esxcli storage nmp psp roundrobin deviceconfig get --device=naa.6000c29xxxxxxxxxxxxxx

# Apply Round Robin to ALL devices matching a SATP rule (persistent across reboots)
# SATP 규칙에 매칭되는 모든 디바이스에 Round Robin 적용 (재부팅 후에도 유지)
# RISK: MODERATE — affects all current and future devices claimed by this SATP
esxcli storage nmp satp rule add \
  --satp VMW_SATP_ALUA \
  --psp VMW_PSP_RR \
  --claim-option tpgs_on

# Change PSP for Fixed policy — set preferred path / Fixed 정책 우선 경로 설정
esxcli storage nmp psp fixed deviceconfig set \
  --device=naa.6000c29xxxxxxxxxxxxxx \
  --path=vmhba1:C0:T0:L0
```

### SATP Reference for Common Vendors / 주요 벤더별 SATP 참조

| Vendor / 벤더 | Array / 어레이 | SATP | Recommended PSP |
|---------------|----------------|------|-----------------|
| Dell EMC | VMAX / PowerMax | VMW_SATP_SYMM | VMW_PSP_RR |
| Dell EMC | Unity / SC Series | VMW_SATP_ALUA | VMW_PSP_RR |
| NetApp | ONTAP (FCP/iSCSI) | VMW_SATP_ALUA | VMW_PSP_RR (iops=1) |
| Pure Storage | FlashArray | VMW_SATP_ALUA | VMW_PSP_RR (iops=1) |
| HPE | 3PAR / Primera / Alletra | VMW_SATP_ALUA | VMW_PSP_RR |
| HPE | MSA | VMW_SATP_MSA | VMW_PSP_MRU |
| Hitachi | VSP series | VMW_SATP_ALUA | VMW_PSP_RR |
| IBM | Storwize / FlashSystem | VMW_SATP_ALUA | VMW_PSP_RR |
| Generic ALUA | Any ALUA-compliant | VMW_SATP_ALUA | VMW_PSP_RR |
| Generic non-ALUA | Active/Active arrays | VMW_SATP_DEFAULT_AA | VMW_PSP_RR |

### Diagnosing Path Issues / 경로 문제 진단
```bash
# Check for dead/standby paths / 비활성/대기 경로 확인
esxcli storage core path list | grep -E "dead|standby|off"

# Check path state for all paths / 모든 경로의 상태 확인
esxcli storage core path list | grep -E "State|Device|Adapter"

# Check I/O stats per path / 경로별 I/O 통계 확인
esxcli storage core path stats get -p vmhba1:C0:T0:L0

# Rescan to detect newly presented paths / 새로 제공된 경로 감지를 위한 재스캔
esxcli storage core adapter rescan --all
```

### Reference / 참조
- KB1011340 — Understanding Storage Array Type Plugin (SATP)
- KB1017760 — Changing the path selection policy
- KB2006leware — Round Robin IOPS setting for all-flash arrays

---

## VMFS Locking Issues / VMFS 잠금 문제

### Overview / 개요
VMFS uses distributed locking to coordinate file access across multiple hosts. A VMDK or flat file can be locked by one host at a time. Stale locks from crashed hosts, zombie processes, or failed vMotion operations cause "file locked" errors.

VMFS는 여러 호스트 간 파일 접근을 조율하기 위해 분산 잠금을 사용합니다. VMDK 또는 flat 파일은 한 번에 하나의 호스트만 잠글 수 있습니다. 충돌한 호스트, 좀비 프로세스, 또는 실패한 vMotion 작업으로 인한 오래된 잠금이 "파일 잠금" 오류를 유발합니다.

### Symptoms / 증상
- "Unable to access file since it is locked" — vCenter task error
- VM power-on fails: "Cannot open the disk 'xxx.vmdk'. Failed to lock the file"
- Snapshot consolidation stuck or fails with "Cannot consolidate"
- vMotion fails: "A general system error occurred: Failed to lock the file"
- Clone or template deployment fails at disk creation step

### Diagnostic / 진단
```bash
# Identify the locking host via VMDK MAC address
# VMDK MAC 주소로 잠금 호스트 식별
# Run from an ESXi host that can see the datastore:
vmkfstools -D /vmfs/volumes/<datastore>/<vm>/<disk>.vmdk

# Output includes "Lock Owners" section with MAC address of locking host
# 출력에는 잠금 호스트의 MAC 주소가 포함된 "Lock Owners" 섹션이 있음
# Example output:
#   Lock [type 10c00001 offset 45268992 v 220, hb offset 3678208
#   gen 532, mode 1, owner 00000000-00000000-0000-000000000000 mtime 12345
#   Lock owners:
#   Addr <4, 54, 0>, gen 2, mode 2, owner 00:50:56:ab:cd:ef mtime 12345]

# Identify host by MAC: compare with each host's vmnic MACs
# MAC으로 호스트 식별: 각 호스트의 vmnic MAC과 비교
esxcli network nic list   # Run on each host to find matching MAC

# Check VMFS ATS heartbeat (VMFS 5/6)
# VMFS ATS 하트비트 확인
vmkfstools -Ph /vmfs/volumes/<datastore>/

# Check for running VMs and processes on suspected host
# 의심되는 호스트에서 실행 중인 VM 및 프로세스 확인
esxcli vm process list
ps | grep vmx

# Search vmkernel log for lock-related messages
# vmkernel 로그에서 잠금 관련 메시지 검색
grep -i "lock\|vmdk\|cannot open" /var/log/vmkernel.log | tail -30

# Check hostd.log for file access errors
grep -i "lock\|locked\|file" /var/log/hostd.log | tail -30
```

### Fix Procedures by Scenario / 시나리오별 수정 절차

**Scenario 1: Locking host is alive and VM is running / 잠금 호스트가 살아있고 VM이 실행 중인 경우**
- This is normal locking behavior. Do NOT break the lock.
- If the VM should not be running, power it off gracefully via vSphere Client.
- 정상적인 잠금 동작입니다. 잠금을 강제로 해제하지 마십시오.

**Scenario 2: Locking host is alive but VM is NOT running / 잠금 호스트가 살아있지만 VM이 실행 중이 아닌 경우**
```bash
# On the locking host: find and kill the stale vmx process
# 잠금 호스트에서: 오래된 vmx 프로세스 찾기 및 종료
esxcli vm process list
# Identify the process by display name or config file path

# Kill the process (MODERATE risk — only if VM is confirmed not running)
# 프로세스 종료 (MODERATE 위험 — VM이 실행 중이 아닌 것이 확인된 경우에만)
esxcli vm process kill --type=soft --world-id=<world-id>
# If soft kill fails, try force:
esxcli vm process kill --type=force --world-id=<world-id>
```

**Scenario 3: Locking host is DOWN (crashed or powered off) / 잠금 호스트가 다운된 경우 (충돌 또는 전원 꺼짐)**
```bash
# The lock will auto-expire after the ATS heartbeat timeout (~2 minutes)
# ATS 하트비트 타임아웃 후 잠금이 자동 만료됨 (~2분)
# Wait 5 minutes, then retry

# If still locked after waiting, forcibly clear the lock from another host
# 대기 후에도 잠금이 남아 있으면 다른 호스트에서 강제 잠금 해제
# RISK: HIGH — only do this if you are 100% certain the locking host is down
# 위험: HIGH — 잠금 호스트가 확실히 다운된 경우에만 수행
vmkfstools -D /vmfs/volumes/<datastore>/<vm>/<disk>.vmdk
# Then power on the VM from another host — ESXi will reclaim the lock automatically
# 그 후 다른 호스트에서 VM 전원을 켜면 ESXi가 자동으로 잠금을 재획득
```

**Scenario 4: Stale lock after failed vMotion / 실패한 vMotion 후 오래된 잠금**
- Wait 15 minutes for automatic lock expiration.
- If not resolved: identify both source and destination hosts; kill any leftover vmx processes on both.
- 자동 잠금 만료를 위해 15분 대기합니다.
- 해결되지 않으면: 소스 및 대상 호스트를 모두 식별하고, 양쪽의 남은 vmx 프로세스를 종료합니다.

### Reference / 참조
- KB10051 — Identifying the ESXi host that has a VMDK file locked
- KB2037507 — Cannot power on a virtual machine due to a locked file
- KB1038193 — Investigating virtual machine file locks on ESXi

---

## Snapshot Consolidation / 스냅샷 통합

### Overview / 개요
Snapshots create delta (redo-log) files that capture changes since the base VMDK. Delta files grow continuously while a snapshot exists. If snapshot removal fails (backup software crash, interrupted consolidation), delta files remain orphaned, causing the "disks consolidation needed" warning and ongoing storage growth.

스냅샷은 기본 VMDK 이후의 변경 사항을 캡처하는 델타(redo-log) 파일을 생성합니다. 스냅샷이 존재하는 동안 델타 파일은 계속 증가합니다. 스냅샷 제거가 실패하면(백업 소프트웨어 충돌, 통합 중단) 델타 파일이 고아 상태로 남아 "디스크 통합 필요" 경고와 지속적인 스토리지 증가를 유발합니다.

### Symptoms / 증상
- "Virtual machine disks consolidation is needed" warning in vCenter
- Datastore space consumption increasing unexpectedly despite no user-created snapshots
- VM performance degradation (I/O latency) due to deep snapshot chains
- Backup job reports success but snapshot count increases over time
- `vim-cmd vmsvc/snapshot.get <vmid>` shows unexpected snapshots

### Root Cause / 근본 원인
| Cause / 원인 | Explanation |
|--------------|-------------|
| Backup agent crash | CBT (Changed Block Tracking) quiesced snapshot not removed after backup |
| vCenter task interrupted | Consolidation started but parent process died |
| Storage latency during consolidation | I/O timeout caused ESXi to abort mid-consolidation |
| CBT reset during backup | Snapshot preserved as baseline for next incremental |
| Manual snapshot removal failure | Insufficient disk space to complete merge |

### Diagnostic / 진단
```bash
# List all VMDK and snapshot-related files on the datastore
# 데이터스토어의 모든 VMDK 및 스냅샷 관련 파일 목록
ls -la /vmfs/volumes/<datastore>/<vm>/
# Look for: *-delta.vmdk (VMFS 5), *-sesparse.vmdk (VMFS 6/vSAN)
# 찾아야 할 파일: *-delta.vmdk (VMFS 5), *-sesparse.vmdk (VMFS 6/vSAN)

# Check snapshot descriptor files
ls -la /vmfs/volumes/<datastore>/<vm>/*.vmsn
ls -la /vmfs/volumes/<datastore>/<vm>/*.vmsd

# Check snapshot chain via vim-cmd (run on vCenter or ESXi host managing the VM)
# vim-cmd로 스냅샷 체인 확인
vim-cmd vmsvc/getallvms | grep <vm-name>   # Get VM ID
vim-cmd vmsvc/snapshot.get <vmid>

# Check snapshot file sizes (large delta = old snapshot with lots of changes)
# 스냅샷 파일 크기 확인 (큰 델타 = 변경 사항이 많은 오래된 스냅샷)
du -sh /vmfs/volumes/<datastore>/<vm>/*delta*
du -sh /vmfs/volumes/<datastore>/<vm>/*sesparse*

# Check if CBT is enabled / CBT 활성화 여부 확인
grep -i "ctkEnabled\|changeTrack" /vmfs/volumes/<datastore>/<vm>/<vm>.vmx
```

### Fix / 수정 방법

**Method 1: Consolidate via vSphere Client (preferred for running VMs)**
**방법 1: vSphere Client를 통한 통합 (실행 중인 VM에 권장)**
1. Right-click the VM in vSphere Client.
2. Navigate to **Snapshots > Consolidate**.
3. vSphere Client에서 VM을 마우스 오른쪽 버튼으로 클릭합니다.
4. **스냅샷 > 통합**으로 이동합니다.
5. Monitor the task in **Recent Tasks** — consolidation duration scales with delta file size.
6. **최근 작업**에서 작업 모니터링 — 통합 기간은 델타 파일 크기에 따라 달라집니다.

```bash
# Trigger consolidation via vim-cmd / vim-cmd를 통한 통합 트리거
vim-cmd vmsvc/snapshot.consolidate <vmid>
```

**Method 2: Delete all snapshots if consolidation is stuck**
**방법 2: 통합이 멈춘 경우 모든 스냅샷 삭제**
```bash
# Remove all snapshots and consolidate in one operation
# 모든 스냅샷 삭제 및 한 번에 통합
vim-cmd vmsvc/snapshot.removeall <vmid>
```

**Method 3: Shut down VM for stubborn consolidation failures**
**방법 3: 완고한 통합 실패 시 VM 종료**
```bash
# Power off the VM (schedule maintenance window first)
# VM 전원 끄기 (먼저 유지보수 기간 예약)
vim-cmd vmsvc/power.shutdown <vmid>

# Verify VM is powered off / VM 전원이 꺼졌는지 확인
vim-cmd vmsvc/power.getstate <vmid>

# Consolidate with VM off — much faster, no risk of I/O interruption
# VM 꺼진 상태에서 통합 — 훨씬 빠르고 I/O 중단 위험 없음
vim-cmd vmsvc/snapshot.consolidate <vmid>

# Power on after consolidation completes / 통합 완료 후 전원 켜기
vim-cmd vmsvc/power.on <vmid>
```

**Method 4: Manual delta file merge (last resort — use only with VMware support guidance)**
**방법 4: 수동 델타 파일 병합 (최후의 수단 — VMware 지원 지침 하에서만 사용)**
```bash
# RISK: HIGH — incorrect merge order destroys VM data
# 위험: HIGH — 잘못된 병합 순서는 VM 데이터를 파괴함
# Ensure valid backup exists before proceeding
# 진행하기 전에 유효한 백업이 있는지 확인

# Map snapshot chain from .vmsd descriptor
cat /vmfs/volumes/<datastore>/<vm>/<vm>.vmsd

# Merge delta into parent (vmkfstools clone method)
# 델타를 부모에 병합 (vmkfstools 복제 방법)
vmkfstools -i <source-disk>.vmdk -d thin <destination>.vmdk
```

### Important Warnings / 중요 경고
- **Do NOT interrupt** an active consolidation task. An interrupted consolidation leaves the VM in a partially consolidated state that is harder to recover from. / 활성 통합 작업을 **중단하지 마십시오**. 중단된 통합은 VM을 복구하기 더 어려운 부분 통합 상태로 남깁니다.
- For very large delta files (>500 GB), consolidation can take **many hours**. Schedule during a maintenance window. / 매우 큰 델타 파일(>500 GB)의 경우 통합에 **수 시간**이 걸릴 수 있습니다. 유지보수 기간 동안 예약하십시오.
- Always verify **datastore free space** is at least equal to the largest delta file before consolidating. / 통합 전에 **데이터스토어 여유 공간**이 가장 큰 델타 파일과 최소한 동일한지 항상 확인하십시오.
- If using third-party backup software, check the backup console for orphaned jobs before consolidating. / 타사 백업 소프트웨어를 사용하는 경우 통합 전에 백업 콘솔에서 고아 작업을 확인하십시오.

### CBT Reset After Consolidation / 통합 후 CBT 재설정
If backup software relies on CBT, a forced snapshot removal may invalidate CBT state. Reset CBT after consolidation:

백업 소프트웨어가 CBT에 의존하는 경우 강제 스냅샷 제거로 CBT 상태가 무효화될 수 있습니다. 통합 후 CBT를 재설정합니다:
```bash
# Disable CBT / CBT 비활성화
vim-cmd vmsvc/reconfigure <vmid> << 'EOF'
<spec><changeTrackingEnabled>false</changeTrackingEnabled></spec>
EOF

# Create and remove a temporary snapshot to flush CBT
# CBT 플러시를 위해 임시 스냅샷 생성 및 제거
vim-cmd vmsvc/snapshot.create <vmid> "cbt-reset" "Temporary CBT reset" false false
vim-cmd vmsvc/snapshot.removeall <vmid>

# Re-enable CBT / CBT 재활성화
vim-cmd vmsvc/reconfigure <vmid> << 'EOF'
<spec><changeTrackingEnabled>true</changeTrackingEnabled></spec>
EOF
```

### Reference / 참조
- KB1003545 — Understanding virtual machine snapshots in VMware vSphere
- KB2100904 — Consolidating snapshots in vSphere 5.x and later
- KB2039550 — Taking a snapshot of a virtual machine fails or the snapshot appears to be in a bad state
- KB1020128 — Enabling Changed Block Tracking (CBT) on virtual machines
