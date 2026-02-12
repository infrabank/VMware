# ESXi PSOD (Purple Screen of Death) Troubleshooting

> Reference: [Broadcom KB 343033](https://knowledge.broadcom.com/external/article/343033), [Broadcom KB 1006791](https://kb.vmware.com/s/article/1006791), [Dell PSOD MCE Guide](https://www.dell.com/support/kbdoc/en-us/000215212)

## PSOD Overview

PSOD is ESXi's equivalent of a kernel panic. The host crashes and displays a purple diagnostic screen with crash details.

**Impact**: All VMs on the host lose power immediately. HA restarts VMs on other hosts if configured.

---

## Common Causes

### 1. Hardware Failures (Most Common)
| Error Pattern | Cause | Action |
|---------------|-------|--------|
| `MCE` (Machine Check Exception) | CPU/RAM hardware failure | Check BIOS/BMC logs, run hardware diagnostics |
| `NMI` (Non-Maskable Interrupt) | Hardware interrupt (BMC, watchdog) | Check BMC/iLO/iDRAC logs |
| `PF Exception 14` | Page fault / memory corruption | Test RAM, check DIMM seating |
| `#GP Exception 13` | General protection fault | Driver or firmware issue |

### 2. Driver/Firmware Issues
- Outdated NIC/HBA drivers after ESXi upgrade
- Incompatible driver versions (check HCL)
- GPU passthrough driver bugs

### 3. Software Bugs
- Known ESXi bugs (check release notes for known issues)
- Race conditions in VMkernel
- Memory exhaustion (OOM)

### 4. Storage Issues
- All Paths Down (APD) timeout exhaustion
- SCSI sense errors triggering kernel panic
- NFS datastore hang leading to host freeze

---

## Interpreting the PSOD Screen

```
VMware ESXi 7.0.0 [Releasebuild-XXXXXXX x86_64]

#PF Exception 14 in world 12345:vmx-vcpu-0 IP 0xXXXXXXXX addr 0xYYYYYYYY
 ^^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^^^^^^^^^
 |                    |
 Exception type       World (process) that crashed

PTEs: 0xAAAAAAAA 0xBBBBBBBB
error code: 0x0000

0xXXXX:[0xADDRESS]module_name@driver_version+0xOFFSET ...
       ^^^^^^^^^^^ ^^^^^^^^^^^^ ^^^^^^^^^^^^^^^
       |           |            |
       Address     Module name  Function offset (for VMware Support)
```

**Key fields to capture:**
1. **Exception type**: `#PF`, `#GP`, `MCE`, `NMI`
2. **World name**: Which process crashed (vmx = VM, vmkernel = kernel)
3. **Module/Driver**: Which driver was in the call stack
4. **Build number**: Confirm ESXi version

---

## Immediate Response

### Step 1: Capture Information (BEFORE reboot)
```
1. Photograph the PSOD screen (including full backtrace)
2. Note the timestamp
3. Record the exception type and module names
```

### Step 2: Reboot and Collect Core Dump
```bash
# After reboot, check for core dump
esxcli system coredump file list

# Core dump location (default)
ls -la /var/core/

# Generate vm-support bundle (includes core dump)
vm-support
# Output: /var/tmp/esx-<hostname>-<date>.tgz
```

### Step 3: Check Logs Around Crash Time
```bash
# vmkernel log for errors before PSOD
grep -i "error\|fail\|mce\|nmi\|psod\|panic" /var/log/vmkernel.log | tail -50

# Check vmksummary for boot/crash times
cat /var/log/vmksummary.log | tail -20

# Hardware events
grep -i "mce\|hardware\|dimm\|pci" /var/log/vmkernel.log | tail -20
```

### Step 4: Check Hardware Health
```bash
# Check hardware status (if available)
esxcli hardware platform get

# Check PCI devices
lspci -v

# Check memory
vsish -e get /hardware/mem/memoryInfo
```

---

## PSOD Analysis by Exception Type

### MCE (Machine Check Exception)
```
Most common PSOD type. Usually hardware-related.

1. Check BMC/iLO/iDRAC event logs for hardware events
2. Run vendor hardware diagnostics (Dell SupportAssist, HPE Insight)
3. Check BIOS/firmware versions
4. Common fix: Replace failing DIMM or CPU
```

**MCE Bank Codes:**
| Bank | Component |
|------|-----------|
| Bank 0-3 | CPU cores |
| Bank 4 | L3 cache |
| Bank 7-8 | Memory controller |
| Bank 9+ | Platform-specific |

### NMI (Non-Maskable Interrupt)
```
1. Check if NMI was triggered by BMC watchdog
2. Verify iLO/iDRAC firmware is updated
3. Check if another admin pressed "NMI button" (some servers have this)
4. Disable NMI watchdog if false positives:
   esxcli system settings advanced set -o /Misc/NMIAction -i 0
   (0=log only, 1=PSOD, 2=debug)
```

### #PF Exception 14 (Page Fault)
```
Memory access violation. Can be hardware or software.

1. Identify the crashing module from backtrace
2. Check if module is VMkernel or third-party driver
3. If third-party driver: update/remove the driver
4. If VMkernel: check for known issues in release notes
5. If recurring: test RAM with memtest86
```

---

## Prevention

### Pre-emptive Checks
```bash
# Check hardware health events
esxcli hardware platform get
grep -i "error\|warn\|fail" /var/log/vmkernel.log | tail -30

# Check for driver compatibility
esxcli software vib list | grep -i "driver_name"

# Verify HCL compliance
esxcli hardware platform get  # Get platform model
# Cross-reference with VMware HCL: https://www.vmware.com/resources/compatibility
```

### Best Practices
1. **Keep firmware updated** - BIOS, BMC, NIC, HBA firmware
2. **Keep ESXi patched** - Known PSOD bugs are fixed in patches
3. **Check HCL** - Use VMware-certified hardware and driver versions
4. **Monitor hardware health** - Use vendor monitoring tools (Dell OpenManage, HPE OneView)
5. **Configure HA** - Ensures VMs restart on other hosts after PSOD
6. **Enable coredump** - Ensure persistent coredump is configured
7. **Forward syslog** - Logs survive PSOD if forwarded to remote syslog

### Coredump Configuration
```bash
# Ensure coredump is on persistent storage
esxcli system coredump file list
esxcli system coredump file get

# If not configured, create coredump file on VMFS
esxcli system coredump file add --datastore=datastore1 --file=coredump
esxcli system coredump file set --smart --enable true
```
