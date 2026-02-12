# esxcli Command Reference

## System

```bash
# System info
esxcli system version get                    # ESXi version and build
esxcli system hostname get                   # Hostname and FQDN
esxcli system uuid get                       # Host UUID
esxcli system time get                       # Current time
esxcli system boot device get                # Boot device info
esxcli system settings advanced list         # All advanced settings
esxcli system settings advanced set -o <option> -i <int-value>  # Change setting

# Maintenance mode
esxcli system maintenanceMode get            # Check maintenance status
esxcli system maintenanceMode set --enable true   # Enter maintenance
esxcli system maintenanceMode set --enable false  # Exit maintenance

# Shutdown / Reboot
esxcli system shutdown reboot -r "Scheduled maintenance"    # Reboot (CRITICAL)
esxcli system shutdown poweroff -r "Hardware maintenance"   # Power off (CRITICAL)

# Syslog
esxcli system syslog config get              # Syslog config
esxcli system syslog config set --loghost=udp://syslog.example.com:514
esxcli system syslog reload                  # Reload syslog config

# Core dump
esxcli system coredump file list             # List core dumps
esxcli system coredump file get              # Active core dump config
```

## Network

```bash
# NIC info
esxcli network nic list                      # Physical NICs
esxcli network nic get -n vmnic0             # NIC details (driver, speed, duplex)
esxcli network nic stats get -n vmnic0       # NIC statistics
esxcli network nic down -n vmnic1            # Disable NIC (HIGH risk)
esxcli network nic up -n vmnic1              # Enable NIC

# IP configuration
esxcli network ip interface list             # VMkernel interfaces
esxcli network ip interface ipv4 get         # IPv4 addresses
esxcli network ip interface ipv4 set -i vmk0 -I 10.0.0.10 -N 255.255.255.0 -t static
esxcli network ip route ipv4 list            # Routing table
esxcli network ip route ipv4 add -n default -g 10.0.0.1    # Add default gateway
esxcli network ip dns server list            # DNS servers
esxcli network ip dns server add --server=8.8.8.8

# vSwitch
esxcli network vswitch standard list         # Standard vSwitches
esxcli network vswitch standard add -v vSwitch1
esxcli network vswitch standard set -v vSwitch1 -m 9000    # Set MTU
esxcli network vswitch standard uplink add -v vSwitch1 -u vmnic1
esxcli network vswitch standard portgroup list
esxcli network vswitch standard portgroup add -v vSwitch0 -p "My Network"
esxcli network vswitch standard portgroup set -p "My Network" --vlan-id 100

# Distributed vSwitch
esxcli network vswitch dvs vmware list       # DVS list

# Firewall
esxcli network firewall get                  # Firewall status
esxcli network firewall ruleset list         # All rulesets
esxcli network firewall ruleset set --ruleset-id=sshServer --enabled=true
esxcli network firewall refresh              # Reload rules

# VM networking
esxcli network vm list                       # VMs with networking info
esxcli network vm port list -w <world-id>    # VM port details

# Diagnostics
esxcli network diag ping -H <target-ip>     # Ping from ESXi
esxcli network ip neighbor list              # ARP table
```

## Storage

```bash
# Devices and paths
esxcli storage core device list              # All storage devices
esxcli storage core device stats get         # Device I/O stats
esxcli storage core path list                # All storage paths
esxcli storage core adapter list             # Storage adapters (HBAs)
esxcli storage core adapter rescan --all     # Rescan all HBAs

# NMP (Native Multipathing)
esxcli storage nmp device list               # Multipathing info per device
esxcli storage nmp path list                 # Path details
esxcli storage nmp satp rule list            # SATP rules

# VMFS
esxcli storage vmfs extent list              # VMFS extents
esxcli storage vmfs snapshot list            # Snapshot/replica volumes
esxcli storage vmfs snapshot mount -l <label>  # Mount snapshot volume

# NFS
esxcli storage nfs list                      # NFS mounts
esxcli storage nfs add -H <server> -s <share> -v <datastore-name>
esxcli storage nfs remove -v <datastore-name>

# iSCSI
esxcli iscsi adapter list                    # iSCSI adapters
esxcli iscsi adapter target portal list      # Target portals
esxcli iscsi session list                    # Active sessions
esxcli iscsi adapter discovery sendtarget add --adapter=vmhba65 --address=<target-ip>

# Claiming / Unclaiming
esxcli storage core claiming autoclaim --enabled=true
esxcli storage core claiming reclaim -d <device>
```

## Software / VIBs

```bash
# Installed software
esxcli software vib list                     # All installed VIBs
esxcli software profile get                  # Current image profile

# Install / Update
esxcli software vib install -d /vmfs/volumes/ds1/patch.zip   # Install VIB (CRITICAL)
esxcli software vib update -d /vmfs/volumes/ds1/patch.zip    # Update VIB (CRITICAL)
esxcli software vib remove -n <vib-name>     # Remove VIB (HIGH)
esxcli software profile update -d /vmfs/volumes/ds1/depot.zip -p <profile-name>  # Profile update (CRITICAL)

# Acceptance level
esxcli software acceptance get               # Current acceptance level
esxcli software acceptance set --level=CommunitySupported
# Levels: VMwareCertified > VMwareAccepted > PartnerSupported > CommunitySupported

# Source profiles
esxcli software sources profile list -d /vmfs/volumes/ds1/depot.zip
```

## VM Operations (vim-cmd)

```bash
# VM listing
vim-cmd vmsvc/getallvms                      # All registered VMs
vim-cmd vmsvc/get.summary <vmid>             # VM summary
vim-cmd vmsvc/get.config <vmid>              # VM config
vim-cmd vmsvc/get.runtime <vmid>             # VM runtime state
vim-cmd vmsvc/get.guest <vmid>               # Guest OS info

# Power operations
vim-cmd vmsvc/power.on <vmid>                # Power on
vim-cmd vmsvc/power.off <vmid>               # Power off (MEDIUM)
vim-cmd vmsvc/power.reset <vmid>             # Reset (MEDIUM)
vim-cmd vmsvc/power.shutdown <vmid>          # Guest shutdown
vim-cmd vmsvc/power.reboot <vmid>            # Guest reboot
vim-cmd vmsvc/power.suspend <vmid>           # Suspend

# Snapshots
vim-cmd vmsvc/snapshot.create <vmid> "snap-name" "description" 0 0
vim-cmd vmsvc/snapshot.get <vmid>            # List snapshots
vim-cmd vmsvc/snapshot.revert <vmid> 0 0     # Revert to current
vim-cmd vmsvc/snapshot.removeall <vmid>      # Remove all (HIGH)

# Registration
vim-cmd solo/registervm /vmfs/volumes/ds1/vm/vm.vmx   # Register VM
vim-cmd vmsvc/unregister <vmid>              # Unregister (does NOT delete files)
vim-cmd vmsvc/destroy <vmid>                 # Delete VM and files (CRITICAL)
```

## Host Services

```bash
# Service management
vim-cmd hostsvc/service/query                # List all services
vim-cmd hostsvc/enable_ssh                   # Enable SSH
vim-cmd hostsvc/start_ssh                    # Start SSH
vim-cmd hostsvc/disable_ssh                  # Disable SSH
vim-cmd hostsvc/enable_esx_shell             # Enable ESXi Shell
vim-cmd hostsvc/start_esx_shell              # Start ESXi Shell

# NTP
esxcli system ntp get                        # NTP status
esxcli system ntp set --server=ntp.example.com --enabled=true

# Host config backup
vim-cmd hostsvc/firmware/backup_config        # Backup host config
vim-cmd hostsvc/firmware/restore_config /tmp/configBundle.tgz  # Restore (CRITICAL)
```

## vSAN

```bash
# Cluster info
esxcli vsan cluster get                      # Cluster UUID, state
esxcli vsan cluster join -u <cluster-uuid>   # Join cluster
esxcli vsan cluster leave                    # Leave cluster (HIGH)

# Storage
esxcli vsan storage list                     # vSAN disk list
esxcli vsan storage add -s <ssd-id> -d <hdd-id>  # Create disk group
esxcli vsan storage remove -d <device-id>    # Remove disk (HIGH)

# Health
esxcli vsan health cluster list              # Health checks
esxcli vsan health cluster get -t "Network health"

# Network
esxcli vsan network list                     # vSAN network config
esxcli vsan network ip add -i vmk2 -T vsan   # Tag VMkernel for vSAN

# Debug
esxcli vsan debug disk list                  # Disk debug info
esxcli vsan debug object list                # Object list
esxcli vsan debug object health summary get  # Object health
```

## Useful One-Liners

```bash
# Find VM by name
vim-cmd vmsvc/getallvms | grep -i "vm-name"

# List all powered-on VMs
vim-cmd vmsvc/getallvms | while read vmid rest; do
  state=$(vim-cmd vmsvc/power.getstate $vmid 2>/dev/null | tail -1)
  [ "$state" = "Powered on" ] && echo "$vmid $rest"
done

# Check all datastore free space
esxcli storage vmfs extent list
df -h /vmfs/volumes/*/

# Export host config
vim-cmd hostsvc/firmware/backup_config
# Output: Bundle written to /scratch/downloads/configBundle-xxx.tgz

# Find world ID for a VM (for troubleshooting)
esxcli vm process list

# Kill a stuck VM (HIGH risk)
esxcli vm process kill --type=soft --world-id=<wid>    # Soft kill
esxcli vm process kill --type=hard --world-id=<wid>    # Hard kill
esxcli vm process kill --type=force --world-id=<wid>   # Force kill (last resort)
```
