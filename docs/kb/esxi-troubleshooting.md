# ESXi Host Troubleshooting Guide

> **vSphere 7.0 EOL Notice**: vSphere 7.0은 2025-10-02 일반 지원 종료, 2027-10-02 기술 지침 종료 예정입니다.
> vSphere 8.0 환경에서도 본 문서의 트러블슈팅 절차가 대부분 동일하게 적용됩니다.
> ESXi 8.0 최신 빌드: 8.0 U3i (빌드 25205845, 2026-02-23)
> 참고: [Broadcom KB 322186 — vSphere 7.0 EOL](https://knowledge.broadcom.com/external/article/322186)

## Host Not Responding / Disconnected in vCenter

### Symptoms
- Host shows "Not Responding" in vCenter
- VMs on host still running but unmanageable from vCenter

### Diagnostic Steps
1. **Verify network connectivity**
   ```
   ping <esxi-host-ip>
   vmkping <vcenter-ip>  # from ESXi shell
   ```

2. **Check management agents**
   ```bash
   # SSH into ESXi host
   /etc/init.d/hostd status
   /etc/init.d/vpxa status
   ```

3. **Review logs**
   ```
   /var/log/hostd.log      # Host daemon
   /var/log/vpxa.log       # vCenter agent
   /var/log/vmkernel.log   # Kernel messages
   ```

### Resolution
```bash
# Restart management agents (MEDIUM risk)
/etc/init.d/hostd restart
/etc/init.d/vpxa restart

# If agents won't restart, full management restart
services.sh restart    # HIGH risk - brief VM management interruption
```

### Reference
- KB2032823 — ESXi host disconnects from vCenter
- KB1003490 — Restarting management agents on ESXi

---

## Purple Screen of Death (PSOD)

### Symptoms
- ESXi host crashes with a purple diagnostic screen
- All VMs on host go down

### Diagnostic Steps
1. **Capture the PSOD screen** — photograph or record the error message
2. **Collect core dump** after reboot:
   ```bash
   esxcli system coredump file list
   vm-support    # Generate support bundle
   ```
3. **Key info from PSOD**: Exception type, module name, backtrace

### Common Causes
| Cause | Indicators |
|-------|------------|
| Driver bug | Module name in backtrace (e.g., nmlx5_core) |
| Hardware failure | MCE (Machine Check Exception) in vmkernel.log |
| Memory corruption | NMI or parity error |
| Firmware bug | Occurs after firmware update |

### Resolution
- Update ESXi to latest patch level
- Update hardware firmware/drivers from vendor (check HCL)
- If recurring, engage VMware Support with vm-support bundle

### Reference
- KB1004250 — Collecting diagnostic information for PSOD
- KB2145


---

## ESXi Host Cannot Enter Maintenance Mode

### Symptoms
- Maintenance mode task hangs or fails
- "Cannot complete operation" errors

### Diagnostic Steps
```bash
# Check what's blocking
esxcli vm process list       # Running VMs
vim-cmd vmsvc/getallvms      # Registered VMs
```

### Common Blockers
1. **Powered-on VMs without DRS** — manually vMotion or power off VMs
2. **FT-enabled VMs** — disable FT first
3. **vSAN data evacuation** — insufficient resources to rebuild
4. **ISO mounted from local storage** — disconnect media first

### Resolution
```bash
# Force maintenance mode (HIGH risk — only if VMs can be disrupted)
esxcli system maintenanceMode set --enable true --vsanmode=ensureObjectAccessibility

# Check vSAN specifically
esxcli vsan maintenancemode cancel  # If stuck
```

---

## ESXi Storage Performance Issues

### Diagnostic Steps
```bash
# Check device latency
esxcli storage core device stats get
# Look for DAVG (device average) > 20ms

# Check active paths
esxcli storage nmp device list

# Check queue depths
esxcli storage core device list | grep -E "Queue|Device"

# Real-time I/O stats
esxtop    # Press 'u' for disk view
```

### Key Metrics in esxtop (Disk)
| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| DAVG (device latency) | < 10ms | 10-25ms | > 25ms |
| KAVG (kernel latency) | < 2ms | 2-5ms | > 5ms |
| GAVG (guest latency) | < 15ms | 15-30ms | > 30ms |
| QAVG (queue latency) | < 1ms | 1-5ms | > 5ms |

### Common Causes
- **High DAVG**: Storage array/SAN bottleneck
- **High KAVG**: ESXi kernel scheduler issue, driver bug
- **High QAVG**: Queue depth too low for workload

---

## ESXi Upgrade / Patch Failures

### Pre-upgrade Checklist
- [ ] Check VMware Interoperability Matrix for compatibility
- [ ] Verify hardware on HCL for target version
- [ ] Take host config backup: `vim-cmd hostsvc/firmware/backup_config`
- [ ] Enter maintenance mode
- [ ] Ensure sufficient boot media space

### Patching via esxcli
```bash
# List available VIBs in depot
esxcli software sources profile list -d /vmfs/volumes/datastore1/patches/VMware-ESXi-7.0U3s-24585291-depot.zip

# Install profile (CRITICAL — requires maintenance mode)
esxcli software profile update -d /vmfs/volumes/datastore1/patches/VMware-ESXi-7.0U3s-24585291-depot.zip -p ESXi-7.0U3s-24585291-standard

# Check installed VIBs after update
esxcli software vib list | head -20
```

### Common Failures
| Error | Cause | Fix |
|-------|-------|-----|
| `VIB requires host in maintenance mode` | Host not in maintenance | Enter maintenance mode first |
| `Conflicting VIBs` | Third-party driver conflict | `--no-sig-check` or remove conflicting VIB |
| `Insufficient space on bootbank` | Boot media full | Clean up old VIBs, expand if possible |
| `Dependency error` | Missing prerequisite | Install deps first or use full profile update |

---

## SSH / Shell Access Issues

### Enable SSH
```bash
# Via DCUI: Troubleshooting Options > Enable SSH
# Via esxcli (if shell access available):
vim-cmd hostsvc/enable_ssh
vim-cmd hostsvc/start_ssh
```

### Via vCenter (PowerCLI)
```powershell
Get-VMHost esxi-01 | Get-VMHostService | Where-Object {$_.Key -eq "TSM-SSH"} | Start-VMHostService -Confirm:$false
```

### Lockdown Mode
```bash
# Check lockdown mode
vim-cmd -U dcui vimsvc/auth/lockdown_is_enabled

# Disable lockdown (via DCUI or mob)
# Normal lockdown: direct console access still works
# Strict lockdown: only vCenter access, DCUI disabled
```

---

## NTP / Time Synchronization Issues

### Symptoms
- Certificate errors (time-dependent)
- vCenter/host communication failures
- Log timestamps inconsistent

### Fix
```bash
# Check current time
date
esxcli system time get

# Configure NTP
esxcli system ntp set --server=ntp1.example.com --server=ntp2.example.com
esxcli system ntp set --enabled=true

# Verify
esxcli system ntp get
ntpq -p    # Check peer status
```

### Reference
- KB2012069 — Configuring NTP on ESXi

---

## ESXi Boot Failure / Boot Device Issues / 부트 장애

### Symptoms
- "No hypervisor found" or "Loading /s.v00 failed" during boot
- ESXi fails to boot after USB/SD card degradation
- Boot bank corruption: "/altbootbank not found"
- Host reboots loop without completing POST to ESXi

### Root Cause Analysis
- USB/SD card wear-out (write cycles exceeded) — ESXi 7.0 writes more to boot device than 6.x
- Boot bank corruption from power loss during VIB installation
- BIOS boot order changed after firmware update
- Incompatible boot device (< 8GB or slow USB 2.0)

### Diagnostic Commands
```bash
# Check boot device
esxcli storage core device list | grep -i "Is Boot Device"
vsish -e get /system/bootDevice

# Check boot banks
ls -la /bootbank/
ls -la /altbootbank/
esxcli software profile get

# Check USB/SD health (if accessible)
vdq -q
esxcli storage core device smart get -d <device>
```

### Fix

**Scenario 1: Boot bank rebuild from altbootbank**
```bash
# Boot into recovery shell via DCUI or iLO/iDRAC console
# Verify altbootbank is intact
ls -la /altbootbank/

# Copy altbootbank contents to bootbank
cp -r /altbootbank/* /bootbank/

# Reboot
reboot
```

**Scenario 2: USB replacement procedure**
```bash
# 1. Boot ESXi from ISO (rescue/installer mode)
# 2. Insert new USB device (>= 8GB, USB 3.0 recommended)
# 3. Run installer — select "Install, preserve VMFS datastore"
# 4. After install, restore host config from backup:
vim-cmd hostsvc/firmware/restore_config /tmp/configBundle.tgz
```

**Scenario 3: Clean install with VMFS preservation**
```bash
# During ESXi installer, when prompted:
# Select "Install ESXi, preserve VMFS datastore"
# This retains all VM storage while reinstalling the hypervisor

# After reinstall, re-add host to vCenter and reattach datastores
esxcli storage vmfs extent list
```

### VMware Recommendation for 7.0
- USB/SD boot deprecated in vSphere 7.0 Update 3+ (KB 85685)
- Recommend migrating to M.2/BOSS for persistent boot device
- If USB must be used: disable coredump on boot device, redirect scratch to VMFS

### Reference
- KB85685 — USB/SD boot device deprecation in vSphere 7.0 Update 3
- KB2042141 — ESXi boot bank recovery procedures

---

## ESXi Ramdisk Full (/tmp, /var/run) / Ramdisk 용량 부족

### Symptoms
- hostd/vpxa service crashes or fails to restart
- "Ramdisk (tmp) is full" or "No space left on device" in vmkernel.log
- Cannot SSH to host or run esxcli commands
- syslog: "Ramdisk 'tmp' is full. VMkernel may stop functioning"

### Root Cause
- Excessive logging fills /var/run/log ramdisk
- Large core dump files in /tmp
- Failed VIB installation leaves temp files
- Stale DCUI/Shell sessions consuming memory

### Diagnostic Commands
```bash
# Check ramdisk usage
vdf -h
ls -la /tmp/
du -sh /var/run/log/*

# Check system memory pressure
vsish -e get /memory/comprehensive
```

### Fix
```bash
# Clear temp files (SAFE)
rm -f /tmp/vmware-*.log
rm -f /tmp/scratch/downloads/*

# Rotate logs manually (SAFE)
esxcli system syslog reload

# If SSH not available, use DCUI:
# Troubleshooting Options > Restart Management Agents
```

### Prevention
- Redirect scratch to persistent VMFS:
```bash
esxcli system settings advanced set -o /ScratchConfig/ConfiguredScratchLocation \
  -s /vmfs/volumes/<datastore>/scratch/<hostname>
```
- Configure remote syslog to reduce local log volume
- Monitor ramdisk usage via SNMP or script

### Reference
- KB1009555 — ESXi scratch partition and ramdisk configuration
- KB2149257 — Ramdisk full conditions on ESXi hosts
