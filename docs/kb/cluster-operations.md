# Cluster Operations Guide

## vSphere HA (High Availability)

### How HA Works
1. One host elected as **master** (via election)
2. Master monitors **slave** hosts via network heartbeats and datastore heartbeats
3. If a host fails, master restarts VMs on surviving hosts
4. Admission Control reserves capacity for failovers

### HA States
| State | Meaning |
|-------|---------|
| Connected (green) | HA configured and healthy |
| Host not reachable / isolated | Network heartbeat lost |
| Election in progress | Master being selected |
| Configuration error | HA agent (FDM) issue |

### Troubleshoot HA
```bash
# Check HA agent status on host
/etc/init.d/fdm status

# HA agent logs
/var/log/fdm.log

# Restart HA agent (MEDIUM risk)
/etc/init.d/fdm restart

# From vCenter (PowerCLI) — reconfigure HA on host
$vmhost = Get-VMHost "esxi-01"
$vmhost | Get-Cluster | Set-Cluster -HAEnabled:$false -Confirm:$false
$vmhost | Get-Cluster | Set-Cluster -HAEnabled:$true -Confirm:$false
```

### HA Isolation Response
| Setting | Behavior when host is isolated |
|---------|-------------------------------|
| Disabled | VMs remain running on isolated host |
| Power off | VMs powered off, restarted elsewhere |
| Shut down | Guest OS shut down, restarted elsewhere |

### Admission Control Policies
| Policy | Description |
|--------|-------------|
| Cluster resource percentage | Reserve X% CPU/memory for failover |
| Dedicated failover hosts | Designate specific hosts for failover only |
| Slot policy | Calculate slots based on largest VM reservation |

---

## DRS (Distributed Resource Scheduler)

### DRS Automation Levels
| Level | Behavior |
|-------|---------|
| Manual | DRS recommends, admin approves |
| Partially automated | Initial placement automatic, migrations recommended |
| Fully automated | All placement and migrations automatic |

### DRS Aggressiveness (Migration Threshold)
- Level 1 (Conservative): Only mandatory migrations
- Level 3 (Default): Balance between performance and stability
- Level 5 (Aggressive): Frequent migrations for small imbalances

### DRS Rules
```powershell
# VM-VM Affinity (keep together)
New-DrsRule -Cluster "Production" -Name "Web-AppTier" -KeepTogether -VM (Get-VM "web-01","app-01")

# VM-VM Anti-Affinity (keep apart)
New-DrsRule -Cluster "Production" -Name "DC-Separation" -KeepTogether:$false -VM (Get-VM "dc-01","dc-02")

# VM-Host Affinity
# Must create VM Group and Host Group first
New-DrsClusterGroup -Cluster "Production" -VM (Get-VM "sql-*") -Name "SQL-VMs"
New-DrsClusterGroup -Cluster "Production" -VMHost (Get-VMHost "esxi-01","esxi-02") -Name "SQL-Hosts"
New-DrsVMHostRule -Cluster "Production" -Name "SQL-on-SQLHosts" -VMGroup "SQL-VMs" -VMHostGroup "SQL-Hosts" -Type ShouldRunOn
```

### DRS Troubleshooting
- **VMs not balancing**: Check DRS rules for conflicts, check VM overrides
- **DRS faults**: Look in vCenter > Cluster > Monitor > DRS
- **vMotion failing**: Check vMotion VMkernel, host compatibility, EVC mode

---

## vMotion Operations

### vMotion Prerequisites
- [ ] vMotion VMkernel adapter on both hosts
- [ ] Shared storage (for compute vMotion) or sufficient bandwidth (for storage vMotion)
- [ ] Compatible CPU families (or EVC enabled)
- [ ] 1Gbps minimum, 10Gbps recommended
- [ ] Same vCenter management

### vMotion Types
| Type | What Moves | Requirements |
|------|-----------|-------------|
| Compute vMotion | VM memory/CPU state | Shared datastore, vMotion network |
| Storage vMotion | VM disk files | No shared storage needed |
| Cross-host + storage | Both compute and storage | Both requirements |
| Cross-vCenter | VM to different vCenter | vSphere 6.0+ (Enhanced Linked Mode recommended) |
| Long-distance vMotion | VM across sites | vSphere 6.0+, max 150ms RTT |

### vMotion Troubleshooting
```bash
# Check vMotion VMkernel
esxcli network ip interface tag get -i vmk1
# Should show "vmotion"

# Test vMotion connectivity
vmkping -I vmk1 <target-host-vmotion-ip>

# Check EVC mode
# vSphere Client > Cluster > Configure > VMware EVC

# vMotion logs
grep -i vmotion /var/log/vmkernel.log
grep -i "VMotion\|migrate" /var/log/hostd.log
```

### vMotion Performance
```bash
# Maximum concurrent vMotions per host:
# 1GbE: 4 concurrent
# 10GbE: 8 concurrent
# 25GbE+: 8 concurrent (configurable up to 128 in 7.0+)

# Adjust in Advanced Settings:
# Config.Migrate.VMotionStreamHelpers (default: 0 = auto)
```

---

## Maintenance Mode Procedures

### Pre-Maintenance Checklist
- [ ] Verify DRS can accommodate all VMs on remaining hosts
- [ ] Check HA admission control (won't block if capacity insufficient)
- [ ] Note any VM-Host affinity rules that might prevent migration
- [ ] Verify vMotion network is healthy
- [ ] If vSAN, ensure data evacuation capacity

### Enter Maintenance Mode
```powershell
# PowerCLI — with DRS migration
Set-VMHost -VMHost "esxi-01" -State Maintenance -Evacuate:$true

# PowerCLI — force (HIGH risk)
Set-VMHost -VMHost "esxi-01" -State Maintenance -Evacuate:$true -Confirm:$false
```

```bash
# esxcli (from ESXi shell)
esxcli system maintenanceMode set --enable true

# With vSAN option
esxcli system maintenanceMode set --enable true --vsanmode=ensureObjectAccessibility
```

### Exit Maintenance Mode
```powershell
Set-VMHost -VMHost "esxi-01" -State Connected
```
```bash
esxcli system maintenanceMode set --enable false
```

---

## EVC (Enhanced vMotion Compatibility)

### Purpose
EVC masks CPU features to a common baseline, enabling vMotion between different CPU generations.

### EVC Modes (Intel)
| EVC Mode | CPU Generation |
|----------|---------------|
| Merom | Core 2 Duo era |
| Penryn | Core 2 Duo 45nm |
| Nehalem | 1st Gen Xeon |
| Westmere | Westmere Xeon |
| Sandy Bridge | 2nd Gen Xeon |
| Ivy Bridge | 3rd Gen Xeon |
| Haswell | 4th Gen Xeon |
| Broadwell | 5th Gen Xeon |
| Skylake | 6th Gen Xeon Scalable |
| Cascade Lake | 2nd Gen Xeon Scalable |
| Ice Lake | 3rd Gen Xeon Scalable |
| Sapphire Rapids | 4th Gen Xeon Scalable |

### Enable EVC
- **Requirement**: All VMs must be powered off or already compatible
- **Best practice**: Set EVC mode to lowest CPU generation in cluster
- **Change EVC**: Power off incompatible VMs → change mode → power on

```powershell
# Check current EVC mode
(Get-Cluster "Production").EVCMode

# Set EVC mode
Set-Cluster -Cluster "Production" -EVCMode "intel-skylake"
```

---

## Resource Pools

### Best Practices
| Setting | Recommendation |
|---------|---------------|
| Reservations | Use sparingly — guarantees but fragments capacity |
| Limits | Use for cost allocation or noisy neighbor prevention |
| Shares | Relative priority during contention only |
| Expandable Reservation | Enable unless strict resource partitioning needed |

### Common Mistakes
1. **Nested resource pools with reservations** — fragments memory, causes ballooning
2. **Limits set too low** — VMs throttled even when cluster has free resources
3. **Not understanding shares** — shares only matter during contention, not during normal operation

```powershell
# Create resource pool
New-ResourcePool -Location (Get-Cluster "Production") -Name "Dev" -CpuSharesLevel Normal -MemSharesLevel Normal

# Set limits
Set-ResourcePool -ResourcePool "Dev" -CpuLimitMhz 20000 -MemLimitMB 65536
```

---

## Fault Tolerance (FT) / 무중단 보호

### Overview
- Provides zero-downtime protection via real-time VM replication to secondary host
- vSphere 7.0 supports SMP-FT (up to 8 vCPUs, 128GB RAM)
- Requires dedicated FT logging network (low latency, 10Gbps recommended)

### Prerequisites
| Requirement | Detail |
|-------------|--------|
| VM Hardware Version | 11+ (recommended: 19 for 7.0 U3) |
| vCPU Limit | 8 vCPUs maximum |
| Memory Limit | 128GB maximum |
| Thick Provisioned Disk | Required (cannot use thin) |
| EVC Mode | Must be enabled in cluster |
| FT Logging Network | Dedicated VMkernel adapter (vmk) |
| Incompatible Features | Snapshots, Storage vMotion, Hot-add CPU/Memory, vSAN |

### Enable FT
```
vSphere Client > VM > Configure > Fault Tolerance > Turn On
- Select secondary host (automatic with DRS)
- Select datastore for secondary VM
```

### FT Network Configuration
```bash
# Create FT logging VMkernel adapter
esxcli network ip interface add --interface-name=vmk3 --portgroup-name="FT Logging"
esxcli network ip interface ipv4 set --interface-name=vmk3 --ipv4=10.0.3.101 --netmask=255.255.255.0 --type=static

# Tag for FT logging via vSphere Client:
# Host > Configure > VMkernel adapters > vmk3 > Edit > Fault Tolerance logging ✓
```

### Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| Cannot enable FT | Incompatible VM config (snapshots, thin disk) | Remove snapshots, convert to thick disk |
| FT not protected (yellow) | No suitable secondary host | Check EVC, resource availability, FT network |
| High FT latency | FT logging network congestion | Dedicate 10GbE NIC for FT logging |
| FT VM slow | Excessive vCPU/memory for FT overhead | Right-size VM, reduce vCPUs if possible |

---

## HA VM Restart Priority & Orchestration / HA VM 재시작 우선순위

### Restart Priority Levels
| Priority | Level | Behavior |
|----------|-------|----------|
| 1 | Highest | Restarted first after host failure |
| 2 | High | Restarted after priority 1 VMs |
| 3 | Medium (Default) | Standard restart order |
| 4 | Low | Restarted after medium priority |
| 5 | Lowest | Restarted last |
| - | Disabled | Not restarted by HA |

### VM Restart Orchestration (vSphere 7.0+)
- Define restart dependencies between VMs
- Example: Database VM must start before App VM
```
vSphere Client > Cluster > Configure > VM Overrides > Add
- Select VM
- Set HA Restart Priority
- Set VM Dependency Restart Condition:
  - None
  - VMware Tools heartbeat detected
  - Guest heartbeat detected + VM powered on for X seconds
```

### Configuration
```powershell
# Set VM restart priority (PowerCLI)
# SAFE — read/config only
Get-VM "DB-Server" | Set-VM -HARestartPriority "High" -Confirm:$false
Get-VM "Web-Server" | Set-VM -HARestartPriority "Medium" -Confirm:$false
```

### Best Practice
- Priority 1 (Highest): Domain controllers, DNS, DHCP
- Priority 2 (High): Database servers, storage appliances
- Priority 3 (Medium): Application servers
- Priority 4 (Low): Development/test VMs
- Disabled: Stateless VMs that auto-scale
