# Frequently Referenced VMware KB Articles

> Curated list of VMware KB articles commonly needed for vSphere 7.0 administration and troubleshooting.

## Build & Version Reference

| KB | Title | Use Case |
|----|-------|----------|
| [KB 326316](https://knowledge.broadcom.com/external/article/316595) | Build numbers and versions of ESXi | Map build number to release version |
| [KB 2143838](https://knowledge.broadcom.com/external/article/326316) | Build numbers and versions of vCenter Server | Map vCenter build to version |
| [KB 304809](https://knowledge.broadcom.com/external/article/304809) | Build numbers and versions of VMware Tools | VMware Tools version mapping |

---

## Certificate & Authentication

| KB | Title | Use Case |
|----|-------|----------|
| [KB 79248](https://knowledge.broadcom.com/external/article/318968) | Checking expiration of STS certificate | STS cert expiry check & fix |
| [KB 76719](https://kb.vmware.com/s/article/76719) | Replacing STS signing certificate (VCSA) | Fix expired STS cert on VCSA |
| [KB 79263](https://kb.vmware.com/s/article/79263) | Replacing STS signing certificate (Windows) | Fix expired STS cert on Windows VC |
| [KB 83558](https://kb.vmware.com/s/article/83558) | STS Signing Certificates about to expire alarm | Proactive STS monitoring |
| [KB 68171](https://knowledge.broadcom.com/external/article?legacyId=68171) | Certificate Status Change Alarm | Certificate alarm troubleshooting |

---

## Host & Cluster Management

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1006791](https://kb.vmware.com/s/article/1006791) | ESXi host displays purple diagnostic screen | PSOD troubleshooting start |
| [KB 343033](https://knowledge.broadcom.com/external/article/343033) | Interpreting ESXi purple diagnostic screen | PSOD backtrace analysis |
| [KB 1003490](https://kb.vmware.com/s/article/1003490) | ESXi host disconnected from vCenter | Host disconnect troubleshooting |
| [KB 1002111](https://kb.vmware.com/s/article/1002111) | Troubleshooting ESXi host not responding | Host not responding |
| [KB 2032076](https://kb.vmware.com/s/article/2032076) | Using esxtop to identify resource bottlenecks | Performance troubleshooting |

---

## VM Operations

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1004340](https://kb.vmware.com/s/article/1004340) | Powering on a VM fails | VM power-on troubleshooting |
| [KB 1006114](https://kb.vmware.com/s/article/1006114) | Troubleshooting VM responsiveness | Slow/hung VM diagnosis |
| [KB 1002310](https://kb.vmware.com/s/article/1002310) | Consolidating VM snapshots | Snapshot consolidation issues |
| [KB 1015180](https://kb.vmware.com/s/article/1015180) | Snapshot removal gets stuck | Stuck snapshot removal |
| [KB 1004043](https://kb.vmware.com/s/article/1004043) | Deploying OVF/OVA templates | OVF deployment issues |

---

## Storage

| KB | Title | Use Case |
|----|-------|----------|
| [KB 2004684](https://kb.vmware.com/s/article/2004684) | APD (All Paths Down) handling | Storage path loss |
| [KB 2146210](https://kb.vmware.com/s/article/2146210) | PDL (Permanent Device Loss) handling | Permanent storage loss |
| [KB 1020651](https://kb.vmware.com/s/article/1020651) | SCSI sense codes reference | Storage error decoding |
| [KB 2086912](https://kb.vmware.com/s/article/2086912) | Storage latency and performance | Storage perf troubleshooting |
| [KB 1005113](https://kb.vmware.com/s/article/1005113) | Multipathing configuration and failover | Path policy and failover |

---

## Networking

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1004099](https://kb.vmware.com/s/article/1004099) | Troubleshooting VM network connectivity | VM network issues |
| [KB 1010


](https://kb.vmware.com/s/article/1010


) | Understanding NIC teaming | NIC teaming config |
| [KB 2055


](https://kb.vmware.com/s/article/2055


) | Packet capture with pktcap-uw | Network packet capture |
| [KB 1003728](https://kb.vmware.com/s/article/1003728) | Jumbo frames configuration | MTU configuration |

---

## vMotion & Migration

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1003684](https://kb.vmware.com/s/article/1003684) | vMotion fails with general error | vMotion troubleshooting |
| [KB 1005


](https://kb.vmware.com/s/article/1005


) | vMotion network requirements | vMotion prereq check |
| [KB 1028943](https://kb.vmware.com/s/article/1028943) | EVC compatibility matrix | EVC mode planning |

---

## vSphere Lifecycle Manager (vLCM)

| KB | Title | Use Case |
|----|-------|----------|
| [KB 318195](https://knowledge.broadcom.com/external/article/318195) | Failed/queued Check Notification tasks in vCenter 7.x | Check Notification 작업 누적 (6.7→7.0 업그레이드 후) |
| [KB 373331](https://knowledge.broadcom.com/external/article/373331) | vLCM options greyed out after upgrading vCenter | 업그레이드 후 vLCM 메뉴 비활성화 |
| [KB 391927](https://knowledge.broadcom.com/external/article/391927) | Lifecycle Manager missing on vSphere UI | vLCM 플러그인 누락 |
| [KB 390121](https://knowledge.broadcom.com/external/article/390121) | vLCM fails to download with HTTP 403 | Broadcom 토큰 기반 리포지토리 전환 후 다운로드 실패 |
| [KB 372589](https://knowledge.broadcom.com/external/article/372589) | vLCM proxy configuration troubleshooting | 프록시 설정 문제 |
| [KB 391967](https://knowledge.broadcom.com/external/article/391967) | Cluster remediation fails - compliance unavailable | Compliance check 실패 |
| [KB 379329](https://knowledge.broadcom.com/external/article/379329) | Hardware compatibility check internal error | HCL 캐시 DB 손상 |
| [KB 311882](https://knowledge.broadcom.com/external/article/311882) | Baselines to Images drift notifications | Baselines→Images 전환 시 VIB drift |

---

## Patching & Upgrade

| KB | Title | Use Case |
|----|-------|----------|
| [KB 78057](https://kb.vmware.com/s/article/78057) | Smart Card/RSA config before upgrade | Pre-upgrade check |
| [KB 83042](https://kb.vmware.com/s/article/83042) | VIB checksum errors in vLCM | vLCM remediation failures |
| [KB 2118543](https://kb.vmware.com/s/article/2118543) | AD domain joining issues during migration | vCenter migration issues |
| [KB 67
](https://kb.vmware.com/s/article/67
) | vSphere upgrade best practices | Upgrade planning |
| [KB 2058352](https://kb.vmware.com/s/article/2058352) | vCenter upgrade/migration paths | Upgrade compatibility |

---

## vCenter Services

| KB | Title | Use Case |
|----|-------|----------|
| [KB 2150


](https://kb.vmware.com/s/article/2150


) | vCenter service fails to start | Service troubleshooting |
| [KB 2109074](https://kb.vmware.com/s/article/2109074) | VCSA disk partition full | Disk space issues |
| [KB 2111


](https://kb.vmware.com/s/article/2111


) | VCSA backup/restore procedures | Backup troubleshooting |
| [KB 2091961](https://kb.vmware.com/s/article/2091961) | Resetting SSO admin password | Password reset |

---

## HA & DRS

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1033


](https://kb.vmware.com/s/article/1033


) | HA troubleshooting guide | HA general troubleshooting |
| [KB 1005


](https://kb.vmware.com/s/article/1005


) | Understanding HA admission control | Admission control config |
| [KB 1034
](https://kb.vmware.com/s/article/1034
) | DRS troubleshooting guide | DRS issues |

---

## Quick Diagnostic Commands

```bash
# vCenter health check
service-control --status --all    # All services
df -h                              # Disk space
free -m                            # Memory
uptime                             # System uptime

# ESXi health check
esxcli system version get          # Version/build
esxcli hardware platform get       # Hardware info
esxcli network nic list            # NIC status
esxcli storage core path list      # Storage paths
esxcli system maintenanceMode get  # Maintenance mode
```
