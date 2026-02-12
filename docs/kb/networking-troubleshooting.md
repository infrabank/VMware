# Networking Troubleshooting Guide

## VM Network Connectivity Issues

### Diagnostic Steps
```bash
# 1. Check VM NIC status from ESXi side
esxcli network vm list
esxcli network vm port list -w <world-id>

# 2. Check port group assignment
esxcli network vswitch standard portgroup list

# 3. Check physical uplinks
esxcli network nic list
esxcli network nic stats get -n vmnic0

# 4. Check for link status
esxcli network nic get -n vmnic0 | grep Link
```

### Common Causes
| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| No connectivity at all | Wrong port group / VLAN | Verify VLAN ID matches physical switch |
| Intermittent drops | NIC teaming failover | Check teaming policy, beacon probing |
| Slow network | Duplex mismatch | `esxcli network nic get -n vmnic0` |
| Works internally, no external | Default gateway / routing | Check VM gateway, VMkernel routing |

---

## vSwitch Troubleshooting

### Standard vSwitch
```bash
# List vSwitches
esxcli network vswitch standard list

# List port groups
esxcli network vswitch standard portgroup list

# Check uplink configuration
esxcli network vswitch standard portgroup policy failover get -p <portgroup>

# Add uplink
esxcli network vswitch standard uplink add -v vSwitch0 -u vmnic1
```

### Distributed vSwitch (vDS)
```bash
# Check host connection to vDS
esxcli network vswitch dvs vmware list

# Check DVS port status (from vCenter PowerCLI)
Get-VDSwitch -Name "DSwitch" | Get-VDPort | Select-Object Name, ConnectedEntity, VlanConfiguration, State
```

### vDS Recovery — Host Disconnected from vDS
```bash
# If host lost vDS connectivity and management network is on vDS:
# 1. Access DCUI (direct console)
# 2. Restore Standard vSwitch:
esxcli network vswitch standard add -v vSwitch0
esxcli network vswitch standard uplink add -v vSwitch0 -u vmnic0
esxcli network ip interface add -i vmk0 -p "Management Network"

# Or use restore networking command
esxcfg-vswitch -R    # Restore network from backup config
```

---

## VLAN Configuration

### VLAN Modes
| Mode | VLAN ID | Behavior |
|------|---------|----------|
| Access (specific VLAN) | 1-4094 | Tags traffic with specific VLAN |
| Trunk (VLAN 4095) | 4095 | Passes all VLAN tags through (Guest Tagging) |
| No VLAN (VLAN 0) | 0 | No VLAN tagging |

### Verify VLAN Configuration
```bash
# ESXi port group VLAN
esxcli network vswitch standard portgroup list

# Must match physical switch port configuration:
# - If ESXi port group is VLAN 100 → physical switch port must trunk VLAN 100
# - If ESXi port group is VLAN 4095 → physical switch port must be full trunk
```

---

## VMkernel Adapter Issues

### VMkernel Types
| Service | Purpose | Requirements |
|---------|---------|-------------|
| Management | Host management, vCenter communication | Must exist, typically vmk0 |
| vMotion | Live VM migration | Dedicated VLAN recommended |
| vSAN | vSAN cluster communication | Dedicated VLAN, 10GbE minimum |
| FT Logging | Fault Tolerance | Dedicated VLAN, 10GbE |
| Provisioning | Cold migration, cloning | Optional |
| Replication | vSphere Replication traffic | Optional |

### Troubleshoot VMkernel Connectivity
```bash
# List VMkernel interfaces
esxcli network ip interface list

# Check routing table
esxcli network ip route ipv4 list

# Test connectivity from specific VMkernel
vmkping -I vmk1 <target-ip>

# Check MTU
esxcli network ip interface list | grep MTU
vmkping -I vmk1 -d -s 8972 <target-ip>   # Jumbo frame test (9000 MTU)
```

---

## NIC Teaming & Failover

### Teaming Policies
| Policy | Description | Use Case |
|--------|-------------|----------|
| Route based on originating virtual port | Default, balanced across uplinks per VM | General purpose |
| Route based on IP hash | Load balances by source/destination IP | Requires EtherChannel on switch |
| Route based on source MAC hash | Single uplink per MAC | Simple failover |
| Use explicit failover order | Active/standby uplinks | Predictable path |
| Route based on physical NIC load (vDS only) | Dynamic rebalancing | Best load distribution |

### Common Teaming Issues
1. **IP Hash without EtherChannel**: Traffic blackholed
   - Fix: Configure LAG/EtherChannel on physical switch
2. **Beacon probing with single uplink**: False failovers
   - Fix: Use link status only with single uplink
3. **Mismatched teaming between vSwitch and physical switch**
   - Fix: Ensure both sides match (e.g., both LACP or both active/standby)

```bash
# Check current teaming policy
esxcli network vswitch standard policy failover get -v vSwitch0

# Change teaming policy
esxcli network vswitch standard policy failover set -v vSwitch0 -l iphash
```

---

## Packet Capture

### ESXi pktcap-uw (Built-in Packet Capture)
```bash
# Capture on virtual switch uplink
pktcap-uw --uplink vmnic0 -o /tmp/vmnic0.pcap

# Capture on port group
pktcap-uw --switchport <port-id> -o /tmp/port.pcap

# Capture on VMkernel
pktcap-uw --vmk vmk0 -o /tmp/vmk0.pcap

# Capture with filter
pktcap-uw --uplink vmnic0 --ip <target-ip> --proto 0x06 -o /tmp/filtered.pcap

# Capture at specific point
pktcap-uw --uplink vmnic0 --capture UplinkRcv -o /tmp/rx.pcap   # Receive path
pktcap-uw --uplink vmnic0 --capture UplinkSnd -o /tmp/tx.pcap   # Transmit path
```

### Capture Points
```
VM → Virtual Switch → Physical NIC → Network
         ↑                ↑
     SwitchPort       UplinkSnd/Rcv
```

### Analyze Captures
- Download .pcap file and open in Wireshark
- Or use tcpdump-uw on ESXi: `tcpdump-uw -r /tmp/capture.pcap`

---

## Jumbo Frames Configuration

### End-to-End Requirements
All components must support the same MTU:
```
VM Guest OS (MTU 9000) → Port Group (MTU 9000) → vSwitch (MTU 9000) → Physical NIC → Physical Switch (MTU 9000) → Destination
```

### Configure Jumbo Frames
```bash
# Set vSwitch MTU
esxcli network vswitch standard set -v vSwitch0 -m 9000

# Set VMkernel MTU
esxcli network ip interface set -i vmk0 -m 9000

# Verify
vmkping -I vmk0 -d -s 8972 <target-ip>
# 8972 + 28 (IP+ICMP headers) = 9000 MTU
# Success = jumbo frames working end-to-end
```

---

## Firewall Rules

```bash
# List all firewall rulesets
esxcli network firewall ruleset list

# Enable a ruleset
esxcli network firewall ruleset set --ruleset-id=sshClient --enabled=true

# Check specific ruleset allowed IPs
esxcli network firewall ruleset allowedip list -r sshClient

# Add allowed IP to ruleset
esxcli network firewall ruleset allowedip add -r sshClient -i 10.0.0.0/24
```

### Key Firewall Rulesets
| Ruleset | Port | Purpose |
|---------|------|---------|
| sshServer | 22 | SSH access to ESXi |
| httpClient | 80/443 | Outbound HTTP (for updates) |
| nfsClient | 111, 2049 | NFS datastore access |
| vMotion | 8000 | vMotion traffic |
| vSAN | 2233 | vSAN data traffic |
| activeDirectoryAll | 88, 389, 636 | AD authentication |

### Reference
- KB2008226 — Firewall configuration in ESXi
- KB1003804 — Packet capture methods in ESXi
