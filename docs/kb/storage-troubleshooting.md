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
