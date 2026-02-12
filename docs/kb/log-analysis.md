# VMware Log Analysis Guide

## ESXi Log Locations

| Log File | Path | Purpose |
|----------|------|---------|
| vmkernel.log | `/var/log/vmkernel.log` | Kernel messages — storage, networking, hardware |
| hostd.log | `/var/log/hostd.log` | Host management daemon — VM operations, API calls |
| vpxa.log | `/var/log/vpxa.log` | vCenter agent on host — vCenter communication |
| fdm.log | `/var/log/fdm.log` | HA agent (Fault Domain Manager) |
| vobd.log | `/var/log/vobd.log` | VMware Observability daemon — event correlation |
| vmksummary.log | `/var/log/vmksummary.log` | Periodic host status summary |
| shell.log | `/var/log/shell.log` | ESXi shell command history |
| auth.log | `/var/log/auth.log` | Authentication events (SSH, DCUI login) |
| syslog.log | `/var/log/syslog.log` | General syslog messages |
| esxupdate.log | `/var/log/esxupdate.log` | Patch/update operations |
| vmkwarning.log | `/var/log/vmkwarning.log` | Kernel warnings (critical errors) |

### Per-VM Logs
| Log | Location | Purpose |
|-----|----------|---------|
| vmware.log | `/vmfs/volumes/<ds>/<vm>/vmware.log` | VM runtime log — best for VM-specific issues |
| vmware-*.log | Same directory | Rotated VM logs (numbered) |

---

## vCenter (VCSA) Log Locations

| Log File | Path | Purpose |
|----------|------|---------|
| vpxd.log | `/var/log/vmware/vpxd/vpxd.log` | Main vCenter daemon |
| vpxd-profiler.log | `/var/log/vmware/vpxd/vpxd-profiler-*.log` | Performance profiling |
| vpostgres | `/var/log/vmware/vpostgres/postgresql-*.log` | Database |
| sso (STS) | `/var/log/vmware/sso/` | SSO/authentication |
| vmware-content-library | `/var/log/vmware/content-library/` | Content Library |
| vsan-health | `/var/log/vmware/vsan-health/` | vSAN health service |
| vmcad | `/var/log/vmware/vmcad/vmcad.log` | Certificate authority |
| vmdird | `/var/log/vmware/vmdird/vmdird-syslog.log` | VMware Directory Service |

### View Logs via VCSA Shell
```bash
# Tail live logs
tail -f /var/log/vmware/vpxd/vpxd.log

# Search for errors
grep -i "error\|exception\|fail" /var/log/vmware/vpxd/vpxd.log | tail -50

# Generate log bundle
vc-support.sh    # Full bundle
```

---

## Key Log Patterns to Watch

### vmkernel.log — Storage Errors
```
# APD (All Paths Down) — storage temporarily lost
NMP: nmp_ThrottleLogForDevice:... APD

# PDL (Permanent Device Loss)
ScsiDeviceIO:... PDL
Sense Key: 0x5 ASC/ASCQ: 0x25/0x0

# SCSI reservation conflict
SCSI: Reservation conflict

# Device performance warning
NMP: nmp_DeviceRequestFastDeviceProbe:... device latency

# Storage I/O errors
H:0x0 D:0x2 P:0x0    # Device error (check array)
H:0x7 D:0x0 P:0x0    # Selection timeout (path issue)
H:0x8 D:0x0 P:0x0    # Communication failure
```

### vmkernel.log — Networking Errors
```
# NIC link down
vmnic0: link is down
vmnic0: link is up (speed: 10000 Mbps, duplex: full)

# LACP issues
lacp: vmnic0: partner timeout

# Packet drops
net-stats: port X: excessive dropped packets

# DVFilter (NSX / security) issues
DVFilter: filter creation failed
```

### vmkernel.log — Memory
```
# Memory pressure
Balloon: inflating (VM under memory pressure)
Swap: swapping to disk (severe memory pressure — HIGH impact)

# OOM (Out of Memory)
BlueScreen: #PF Exception 14 in world ... (potential PSOD from OOM)
```

### hostd.log — VM Operations
```
# VM power on
[VpxVmomi] Powering on VM

# VM stuck in invalid state
State Transition: INVALID

# Snapshot operations
CreateSnapshot_Task
RemoveAllSnapshots_Task

# Resource issues
AdmissionCheck: resource request exceeds available capacity
```

### vpxa.log — vCenter Agent
```
# Connection issues to vCenter
[VpxaHbSender] Failed to send heartbeat
[VpxdVpxaConnection] Connection lost

# Registration issues
Registration failed
Host agent returned error
```

### fdm.log — HA Issues
```
# HA election
Election completed; master is <host>

# Host failure detected
Marking host <host> as dead

# Network isolation
Isolated from master, isolation response triggered

# VM restart
Attempting to restart VM <vm-name> on host <host>
```

---

## Common Log Analysis Workflows

### "VM won't power on"
```bash
# 1. Check hostd for the attempt
grep -i "poweron\|power on" /var/log/hostd.log | tail -20

# 2. Check for admission control rejection
grep -i "admission\|insufficient" /var/log/hostd.log | tail -10

# 3. Check VM-specific log
tail -100 /vmfs/volumes/<ds>/<vm>/vmware.log

# 4. Check for storage issues
grep -i "error\|fail" /var/log/vmkernel.log | tail -20
```

### "VM performance is slow"
```bash
# 1. Check for memory pressure on host
grep -i "balloon\|swap\|compress" /var/log/vmkernel.log | tail -20

# 2. Check storage latency
grep -i "latency\|DAVG\|timeout" /var/log/vmkernel.log | tail -20

# 3. Check VM log for resource contention
grep -i "contention\|wait\|overcommit" /vmfs/volumes/<ds>/<vm>/vmware.log | tail -20

# 4. Real-time monitoring
esxtop    # Press 'c' for CPU, 'm' for memory, 'u' for disk
```

### "Host disconnected from vCenter"
```bash
# 1. Check vpxa (vCenter agent)
tail -100 /var/log/vpxa.log | grep -i "error\|connection\|timeout"

# 2. Check hostd
tail -100 /var/log/hostd.log | grep -i "error\|fail"

# 3. Check network
vmkping <vcenter-ip>
esxcli network ip interface list

# 4. Check management services
/etc/init.d/hostd status
/etc/init.d/vpxa status
```

### "HA failover happened — why?"
```bash
# 1. Check FDM log for what was detected
grep -i "dead\|isolated\|election\|restart" /var/log/fdm.log | tail -50

# 2. Check vmkernel for hardware/network failures
grep -i "link down\|scsi\|nmi\|mce\|psod" /var/log/vmkernel.log

# 3. Check host availability around the time
grep "$(date +%Y-%m-%d)" /var/log/vmksummary.log
```

---

## Log Rotation and Persistence

### ESXi Log Persistence
- Logs stored in `/scratch/log/` (persistent across reboots if scratch is configured)
- Default scratch: `/tmp/scratch/` (volatile — lost on reboot!)

```bash
# Check scratch location
vim-cmd hostsvc/advopt/query ScratchConfig.CurrentScratchLocation

# Configure persistent scratch (recommended)
vim-cmd hostsvc/advopt/update ScratchConfig.ConfiguredScratchLocation string /vmfs/volumes/<datastore>/.locker-<hostname>
```

### Syslog Forwarding
```bash
# Forward logs to remote syslog server (recommended for production)
esxcli system syslog config set --loghost=udp://syslog.example.com:514
esxcli system syslog reload

# Forward specific log levels
esxcli system syslog config logger set --id=hostd --level=info
```

### Support Bundle Generation
```bash
# Generate vm-support bundle (includes all logs)
vm-support                       # From ESXi shell
vm-support --performance         # Include performance data (larger)

# From vCenter (for all hosts)
# vSphere Client > Host > Monitor > Export System Logs
```

---

## Quick Reference: Time Correlation

When investigating issues across multiple logs, use timestamps to correlate events:

```bash
# Find events around a specific time (e.g., 14:30)
grep "14:3[0-5]" /var/log/vmkernel.log
grep "14:3[0-5]" /var/log/hostd.log
grep "14:3[0-5]" /var/log/vpxa.log

# Multi-log search
for log in vmkernel.log hostd.log vpxa.log; do
    echo "=== $log ==="
    grep "2024-01-15T14:3" /var/log/$log | tail -5
done
```
