# ESXi Host Troubleshooting Guide

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
esxcli software sources profile list -d /vmfs/volumes/datastore1/patches/VMware-ESXi-8.0U2-xxx.zip

# Install profile (CRITICAL — requires maintenance mode)
esxcli software profile update -d /vmfs/volumes/datastore1/patches/VMware-ESXi-8.0U2-xxx.zip -p ESXi-8.0U2-xxx-standard

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
