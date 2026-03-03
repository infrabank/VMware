# NSX-T Operations and Troubleshooting Guide
# NSX-T 운영 및 트러블슈팅 가이드

> **Scope / 범위**: VMware NSX-T 2.x / 3.x / 4.x — API automation, DFW operations, load balancer, transport node troubleshooting
> **Source**: Derived from [vmware-samples/nsx-t](https://github.com/vmware-samples/nsx-t) sample code and official NSX-T documentation patterns.
> **Language**: Bilingual Korean/English

---

## Table of Contents / 목차

1. [개요 / Overview](#1-개요--overview)
2. [아키텍처 / Architecture](#2-아키텍처--architecture)
3. [인증 / Authentication](#3-인증--authentication)
4. [분산 방화벽 (DFW) 운영 / Distributed Firewall Operations](#4-분산-방화벽-dfw-운영--distributed-firewall-operations)
5. [로드 밸런서 / Load Balancer](#5-로드-밸런서--load-balancer)
6. [트러블슈팅 / Troubleshooting](#6-트러블슈팅--troubleshooting)
7. [Terraform / Ansible 자동화 / Infrastructure as Code](#7-terraform--ansible-자동화--infrastructure-as-code)
8. [References / 참고 자료](#8-references--참고-자료)

---

## 1. 개요 / Overview

### 영문 (English)

VMware NSX-T is a software-defined networking (SDN) and security platform that provides micro-segmentation, overlay networking, and distributed firewall capabilities independent of the underlying physical infrastructure. In a vSphere 7.0 environment, NSX-T supplements vSphere networking (vDS) by enabling:

- **Overlay networking**: Logical switches built on GENEVE-encapsulated tunnels (TEP) across ESXi hosts and Edge nodes
- **Micro-segmentation**: Distributed Firewall (DFW) rules enforced at each VM's vNIC in the hypervisor kernel, preventing east-west lateral movement
- **Gateway services**: Tier-0 (T0) and Tier-1 (T1) logical routers providing north-south routing, NAT, and load balancing
- **Policy-based automation**: NSX Policy API allows declarative configuration via REST, Terraform, Ansible, or PowerCLI

NSX-T is a separate product from vSphere and requires its own licensing (NSX Data Center Essentials / Advanced / Enterprise Plus). NSX-T Manager and vCenter Server communicate via integration but run independently.

### 한국어 (Korean)

VMware NSX-T는 물리 인프라에 독립적으로 마이크로 세그멘테이션, 오버레이 네트워킹, 분산 방화벽 기능을 제공하는 소프트웨어 정의 네트워킹(SDN) 및 보안 플랫폼입니다. vSphere 7.0 환경에서 NSX-T는 vSphere 네트워킹(vDS)을 보완하여 다음을 가능하게 합니다:

- **오버레이 네트워킹**: ESXi 호스트 및 Edge 노드 전반에 GENEVE 캡슐화 터널(TEP) 기반의 논리 스위치 구성
- **마이크로 세그멘테이션**: 하이퍼바이저 커널에서 각 VM의 vNIC 수준에서 시행되는 분산 방화벽(DFW) 규칙으로 동서 방향 측면 이동 차단
- **게이트웨이 서비스**: 남북 방향 라우팅, NAT, 로드 밸런싱을 제공하는 Tier-0(T0) 및 Tier-1(T1) 논리 라우터
- **정책 기반 자동화**: NSX Policy API를 통해 REST, Terraform, Ansible, PowerCLI로 선언적 구성 가능

NSX-T는 vSphere와 별도의 제품으로 별도의 라이선스(NSX Data Center Essentials / Advanced / Enterprise Plus)가 필요합니다.

---

## 2. 아키텍처 / Architecture

### 핵심 컴포넌트 / Key Components

| Component | Role | Default Port |
|-----------|------|-------------|
| NSX Manager | Control plane + management plane UI/API | 443 (HTTPS) |
| NSX Controller (embedded in Manager 3.x+) | Distributed state for logical networks | Internal |
| Edge Node | North-south gateway, LB, NAT, VPN | Varies |
| Transport Node (ESXi host) | DFW enforcement, overlay TEP endpoint | N-VDS |
| TEP (Tunnel Endpoint) | GENEVE tunnel origination/termination | UDP 6081 |
| NSX Policy API | Declarative REST API (preferred) | `/policy/api/v1/` |
| NSX Manager API | Imperative REST API (legacy) | `/api/v1/` |

### 네트워크 평면 / Network Planes

```
Management Plane:  NSX Manager (UI/API) ← REST API clients
Control Plane:     NSX Controller (state distribution to Transport Nodes)
Data Plane:        ESXi N-VDS / Edge nodes (actual packet forwarding + DFW)
```

### Transport Zone 유형 / Transport Zone Types

| Type | Use Case |
|------|----------|
| `OVERLAY` | VM-to-VM east-west traffic via GENEVE tunnels (TEP) |
| `VLAN` | Uplink connectivity for Edge nodes, physical network integration |

### Tier-0 / Tier-1 게이트웨이 관계 / Gateway Relationship

```
Internet / Physical Network
         |
    [Tier-0 Gateway]  ← BGP/static routes to physical routers, HA via Edge Cluster
         |
    [Tier-1 Gateway]  ← Connected to one T0; handles NAT, LB, DNS forwarder
         |
    [Segments]        ← Logical switches; VMs attach here
         |
    [VM vNIC]         ← DFW enforced at this boundary
```

---

## 3. 인증 / Authentication

NSX-T API는 세 가지 주요 인증 방식을 지원합니다.
The NSX-T API supports three primary authentication methods.

### 3.1 HTTP Basic Authentication (기본 인증)

The simplest method — username and password are Base64-encoded in the `Authorization` header. Suitable for scripts and lab environments.

**Source**: `python/authentication/basic_auth.py` from [vmware-samples/nsx-t](https://github.com/vmware-samples/nsx-t)

```python
import requests
from com.vmware import nsx_client
from vmware.vapi.lib import connect
from vmware.vapi.security.user_password import \
    create_user_password_security_context
from vmware.vapi.stdlib.client.factories import StubConfigurationFactory

session = requests.session()
session.verify = False  # Disable for self-signed certs (unsafe in production)

nsx_url = 'https://%s:%s' % (nsx_host, tcp_port)
connector = connect.get_requests_connector(
    session=session, msg_protocol='rest', url=nsx_url)
stub_config = StubConfigurationFactory.new_std_configuration(connector)
security_context = create_user_password_security_context(user, password)
connector.set_security_context(security_context)
stub_factory = nsx_client.StubFactory(stub_config)
api_client = ApiClient(stub_factory)

# List all Transport Zones
tzs = api_client.TransportZones.list()
```

**Direct REST (requests 모듈 직접 사용)** — DFW helper scripts pattern:

```python
import requests
from requests.auth import HTTPBasicAuth
from requests.packages.urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

def rest_api_call(method, endpoint, data=None,
                  ip="nsx-mgr.example.com", user="admin", password="VMware1!"):
    url = "https://%s%s" % (ip, endpoint)
    headers = {'Content-Type': 'application/json'}
    res = requests.request(
        method=method,
        url=url,
        auth=HTTPBasicAuth(user, password),
        headers=headers,
        data=data,
        verify=False
    )
    res.raise_for_status()
    if len(res.content) > 0:
        return res.json()
```

### 3.2 Client Certificate Authentication (클라이언트 인증서 인증)

Recommended for production automation. The client presents a PEM-format certificate (cert + private key in one file).

**Source**: `python/authentication/client_cert_auth.py`

```python
session = requests.session()
session.verify = False
session.cert = '/path/to/client-cert-and-key.pem'  # PEM with cert + private key

nsx_url = 'https://%s:%s' % (nsx_host, tcp_port)
connector = connect.get_requests_connector(
    session=session, msg_protocol='rest', url=nsx_url)
stub_config = StubConfigurationFactory.new_std_configuration(connector)
stub_factory = nsx_client.StubFactory(stub_config)
api_client = ApiClient(stub_factory)
```

> **Note**: The client certificate must be registered in NSX Manager under System > Certificates > Import > Client Certificate, and the principal identity must be created.

### 3.3 vIDM Remote Authentication (VMware Identity Manager)

For environments with VMware Identity Manager (vIDM) integration. Uses a Base64-encoded `Authorization: Remote` header.

**Source**: `python/authentication/vidm_remote_auth.py`

```python
import base64

auth_str = base64.b64encode("%s:%s" % (user, password))
session.headers["Authorization"] = "Remote %s" % auth_str
```

### 인증 방식 비교 / Authentication Method Comparison

| Method | Use Case | Security Level |
|--------|----------|---------------|
| Basic Auth | Lab, scripts, initial setup | Low (credentials in plaintext header) |
| Client Certificate | Production automation, CI/CD pipelines | High |
| vIDM Remote | SSO-integrated environments with vIDM | High |
| Session Auth (`SESSION_AUTH`) | SDK-based workflows (creates session token) | Medium-High |

---

## 4. 분산 방화벽 (DFW) 운영 / Distributed Firewall Operations

분산 방화벽은 각 VM의 vNIC 수준에서 시행되며 ESXi 커널 내부에서 동작합니다.
The Distributed Firewall is enforced at each VM's vNIC in the ESXi kernel.

### 4.1 DFW 정책 백업 및 복구 / DFW Policy Backup and Restore

**Source**: `helper-scripts/DFW/nsx-dfw-backup-n-restore.py`

This script backs up and restores NSX DFW policies, rules, groups, L4 services, and L7 context profiles using the NSX Policy API's bulk PATCH endpoint (`/policy/api/v1/infra`).

#### 백업 대상 / What Is Backed Up

| Object | API Filter | Backup File |
|--------|------------|------------|
| L4 Services | `filter=Type-Service` | `<prefix>-services-bkup.json` |
| L7 Context Profiles | `filter=Type-ContextProfile` | `<prefix>-context-profiles-bkup.json` |
| Security Policies, Rules, Groups | `filter=Type-Domain\|SecurityPolicy\|Rule\|Group` | `<prefix>-policy-n-group-bkup.json` |

#### 백업 / Backup

```bash
python nsx-dfw-backup-n-restore.py \
    --nsx-mgr-ip 10.110.57.244 \
    --operation backup \
    --backupfileprefix nsx
```

Example output:
```
NSX DFW L4 services Backup saved as [nsx-services-bkup.json]
NSX DFW L7 context-profiles Backup saved as [nsx-context-profiles-bkup.json]
NSX DFW Policy & Group Backup saved as [nsx-policy-n-group-bkup.json]
NSX DFW Backup has 6 Policy, 37 Rules, 3 Group
```

#### 복구 / Restore

```bash
python nsx-dfw-backup-n-restore.py \
    --nsx-mgr-ip 10.110.57.244 \
    --operation restore \
    --backupfileprefix nsx
```

Expected output:
```
SUCCESS - NSX DFW L4 Services
SUCCESS - NSX DFW L7 Services Restore
SUCCESS - NSX DFW Policy & Group Restore: 6 Policy, 37 Rules, 3 Group
```

#### 핵심 API 패턴 / Core API Pattern

```python
# Backup: GET the full infra object filtered by type
def backup_nsx_dfw_policy_n_group(backupfileprefix):
    endpoint = "/policy/api/v1/infra?filter=Type-Domain|SecurityPolicy|Rule|Group"
    res = rest_api_call(method='GET', endpoint=endpoint)
    with open(backupfileprefix + '-policy-n-group-bkup.json', 'w') as f:
        json.dump(res, f, indent=4)

# Restore: PATCH the entire infra object back
def restore_nsx_dfw_policy_n_group(backupfileprefix):
    with open(backupfileprefix + '-policy-n-group-bkup.json', 'r') as f:
        backup_data = json.load(f)
    endpoint = "/policy/api/v1/infra"
    rest_api_call(method='PATCH', endpoint=endpoint, data=json.dumps(backup_data))
```

> **Caveat**: Prior to NSX-T 3.1, restoring Services via PATCH may fail due to a known API bug. If no custom services exist, you can comment out `restore_nsx_dfw_services()`.

### 4.2 VM별 방화벽 규칙 검사 / Per-VM DFW Rule Inspection

**Source**: `helper-scripts/DFW/nsx-get-dfw-rules-per-vm.py`

This script queries how many DFW datapath rules are programmed per VM vNIC. Useful for monitoring against the 4K rule scale limit per vNIC.

```bash
# Show rule count for all VM vNICs
python nsx-get-dfw-rules-per-vm.py --nsx-mgr-ip 10.114.208.136

# Show only VMs exceeding 100 rules
python nsx-get-dfw-rules-per-vm.py \
    --nsx-mgr-ip 10.114.208.136 \
    --aboverulelimitonly yes \
    --fwrulelimit 100
```

Example output:
```
NSX Manager system wide DFW config summary: 11 Policy, 34 Rules, 27 Group

Rule-Count ------ VM-VNIC
        31   --->  PROD-DB-01/PROD-DB-01.vmx@18a2b527-...
        23   --->  PROD-APP-01/PROD-APP-01.vmx@bb7b1e58-...
```

#### 핵심 API 패턴 / Core API Pattern

```python
# Get all logical ports
endpoint = "/api/v1/logical-ports"
res = rest_api_call(method='GET', endpoint=endpoint)

# For each VM vNIC port (identified by 'vmx@' in name),
# count firewall sections applied to it
for lp in res["results"]:
    if re.search("vmx@", lp["display_name"]):
        endpoint = "/api/v1/firewall/sections?applied_tos=%s&deep_search=true" \
                   % lp["internal_id"]
        fw_sections = rest_api_call(method='GET', endpoint=endpoint)
        rule_count = sum(p["rule_count"] for p in fw_sections["results"])
```

> **Known Caveats**:
> 1. Disabled rules are counted.
> 2. A rule with both TCP and UDP ports counts as 1 here but as 2 in the datapath.
> 3. Multiple L7 Context Profiles in one rule counts as 1 here but as N in the datapath.

### 4.3 DFW 통계 수집 / DFW Statistics Collection

**Source**: `helper-scripts/DFW/nsx-get-dfw-firewall-stats.py`

This script retrieves per-policy, per-rule hit counts. Rules with zero hit counts indicate potentially unused or misconfigured rules.

```python
import requests

nsx_ip = "192.168.200.41"
headers = {
    'Authorization': 'Basic <base64-encoded-admin:password>',
    'Content-Type': 'application/json'
}

# Get all security policies
r = requests.get(
    'https://' + nsx_ip + '/policy/api/v1/infra/domains/default/security-policies',
    verify=False, headers=headers)

for policy in r.json()['results']:
    policy_id = policy['id']
    if policy['category'] == "Ethernet":
        continue  # Skip L2 Ethernet policies

    # Get statistics for each policy
    stats_url = ('/policy/api/v1/infra/domains/default/security-policies/'
                 + policy_id + '/statistics')
    res = requests.get('https://' + nsx_ip + stats_url,
                       verify=False, headers=headers)

    for stats in res.json()['results']:
        for item in stats['statistics']['results']:
            rule_id = item['internal_rule_id']
            hit_count = item['hit_count']
            if hit_count == 0:
                print("Zero-hit rule ID: %s" % rule_id)
```

> **Note**: Set `DISPLAY_ALL_STATS = 1` in the script to show all rules and their counters, not just zero-hit rules.

### 4.4 VM 태그 백업 및 복구 / VM Tag Backup and Restore

**Source**: `helper-scripts/DFW/nsx-vm-tag-backup-n-restore.py`

NSX VM tags drive dynamic group membership (micro-segmentation). This script is particularly useful with VMware SRM — it backs up tags keyed by VM Instance UUID (preserved by SRM during failover).

```bash
# Backup all VM tags
python nsx-vm-tag-backup-n-restore.py \
    --nsx-mgr-ip 10.114.208.136 \
    --operation backup \
    --backupfile nsx-vm-tag-bkup.json

# Restore VM tags (uses Instance UUID to match VMs)
python nsx-vm-tag-backup-n-restore.py \
    --nsx-mgr-ip 10.114.208.136 \
    --operation restore \
    --backupfile nsx-vm-tag-bkup.json
```

#### 핵심 API 패턴 / Core API Pattern

```python
# Backup: get fabric virtual machines inventory
endpoint = "/api/v1/fabric/virtual-machines"
res = rest_api_call(method='GET', endpoint=endpoint)
# Save results (vm name, external_id/instance_uuid, tags)
with open(backupfile, 'w') as f:
    json.dump(res["results"], f, indent=4)

# Restore: re-assign tags by external_id (Instance UUID)
endpoint = "/api/v1/fabric/virtual-machines?action=add_tags"
for vm in backup_data:
    if "tags" in vm:
        body = {
            "external_id": vm["external_id"],  # VM Instance UUID
            "tags": vm["tags"]
        }
        rest_api_call(method='POST', endpoint=endpoint, data=json.dumps(body))
```

### 4.5 태그 기반 NSGroup 동적 멤버십 / Tag-based NSGroup Dynamic Membership

**Source**: `python/basics/tagging.py`

```python
from com.vmware.nsx.model_client import NSGroup, NSGroupTagExpression, Tag, LogicalPort

# Create a group whose members are any logical ports
# with scope="color" and tag="green"
group = NSGroup(
    display_name="Green Logical Ports",
    membership_criteria=[
        NSGroupTagExpression(
            resource_type="NSGroupTagExpression",
            target_type="LogicalPort",
            scope_op="EQUALS",
            scope="color",
            tag_op="EQUALS",
            tag="green"
        )
    ]
)
green_group = api_client.NsGroups.create(group)

# Assign tag to a logical port
lport = api_client.LogicalPorts.get(lport_id)
lport.tags = [Tag(scope="color", tag="green")]
api_client.LogicalPorts.update(lport.id, lport)
# Group membership is recalculated asynchronously (~2 seconds)
```

---

## 5. 로드 밸런서 / Load Balancer

### 5.1 LB VIP 인증서 교체 / LB VIP Certificate Replacement

**Source**: `helper-scripts/LB/ReplaceCerts/replace_cert_in_nsx_vip.py`
Validated with NSX-T 4.1.

This script replaces a TLS certificate on an NSX-T Load Balancer VIP without downtime.

#### 사전 요구 사항 / Prerequisites

- New certificate file (`.crt`) and private key file (`.key`) available on the machine running the script
- NSX Manager admin credentials
- The LB VIP ID (usually matches the VIP display name)
- The old certificate path in NSX (e.g., `/infra/certificates/www1`)

#### 실행 방법 / Usage

```bash
python replace_cert_in_nsx_vip.py \
    -nsx_manager 192.168.110.201 \
    -nsx_user admin \
    -nsx_password 'VMware1!VMware1!' \
    -lb_vip_id vip2 \
    -old_nsx_cert_path /infra/certificates/www1 \
    -new_nsx_cert_name newcert \
    -new_cert_file newcert.crt \
    -new_key_file newcert.key
```

#### 내부 동작 / Internal Flow

```python
# 1. Verify old cert path exists
def nsx_check_cert_path_present(mgr, cert_path):
    certs = nsx_get_call(mgr, '/api/v1/trust-management/certificates')
    for certificate in certs['results']:
        if "tags" in certificate:
            if certificate['tags'][0]['tag'] == cert_path:
                return 'true'
    return 'false'

# 2. Upload new certificate via POST to trust-management
# 3. Associate new cert with LB VIP via PUT
# 4. Verify old cert is no longer referenced
# 5. Optionally delete old certificate
```

#### NSX-T LB 관련 주요 API 엔드포인트 / Key LB API Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List certificates | GET | `/api/v1/trust-management/certificates` |
| Import certificate | POST | `/api/v1/trust-management/certificates?action=import` |
| List LB services | GET | `/policy/api/v1/infra/lb-services` |
| Get LB virtual server | GET | `/policy/api/v1/infra/lb-virtual-servers/<id>` |
| Update LB virtual server | PUT | `/policy/api/v1/infra/lb-virtual-servers/<id>` |
| LB service status | GET | `/policy/api/v1/infra/lb-services/<id>/detailed-status` |

### 5.2 LB 헬스 모니터링 / LB Health Monitoring

```bash
# Check LB service status via curl
curl -k -u admin:'VMware1!' \
  'https://nsx-mgr/policy/api/v1/infra/lb-services/<lb-service-id>/detailed-status'

# Check pool member status
curl -k -u admin:'VMware1!' \
  'https://nsx-mgr/policy/api/v1/infra/lb-pools/<pool-id>/members/statuses'
```

---

## 6. 트러블슈팅 / Troubleshooting

### 6.1 NSX Manager 연결 문제 / NSX Manager Connectivity Issues

#### 증상 / Symptoms
- NSX Manager UI not accessible on port 443
- API calls returning connection refused or timeout
- Transport nodes showing "Not Connected" in Manager

#### 진단 / Diagnosis

```bash
# On NSX Manager (SSH as admin)
get service manager         # Check manager service status
get cluster status          # Check cluster health (3-node managers)
get interface eth0          # Verify IP configuration
get route                   # Check routing table

# Test connectivity from Manager to ESXi host
ping <esxi-mgmt-ip>
nc -zv <esxi-mgmt-ip> 443  # Test HTTPS reachability

# Check NSX Manager logs
tail -f /var/log/vmware/nsx/manager.log
tail -f /var/log/vmware/nsx/proton.log
```

#### 해결 방법 / Resolution

```bash
# Restart NSX Manager services (non-disruptive)
restart service manager
restart service proxy

# Check cluster VIP if 3-node deployment
get cluster virtual-ip
```

### 6.2 Transport Node 준비 실패 / Transport Node Preparation Failures

#### 증상 / Symptoms
- ESXi host stuck in "Not Ready" or "Failed" state in NSX > Infrastructure > Transport Nodes
- Error: "Transport node preparation failed"
- VIBs not installed or incorrect version

#### 진단 / Diagnosis

```bash
# On ESXi host (SSH)
esxcli software vib list | grep nsx      # Check NSX VIBs installed
esxcli software vib list | grep vmware-nsx

# Verify N-VDS (NSX Virtual Distributed Switch)
esxcli network vswitch dvs vmware list   # List all DVS including N-VDS
net-vdl2 -l                              # List VDL2 (VXLAN/GENEVE) state

# Check hostd connectivity to NSX Manager
cat /etc/vmware/nsx/             # NSX config on host
esxcli network ip connection list | grep 443  # Verify outbound 443 connections

# On NSX Manager
get transport-node <uuid> state  # Check transport node state
get transport-node <uuid> status # Detailed status
```

#### 해결 방법 / Resolution

```bash
# Re-apply transport node configuration from NSX Manager UI:
# NSX > Infrastructure > Transport Nodes > Select host > Actions > Resolve

# Or via API:
curl -k -u admin:'VMware1!' -X POST \
  'https://nsx-mgr/api/v1/transport-nodes/<node-id>?action=restoreClusterConfig'

# Check NSX agent on ESXi
/etc/init.d/nsx-agent status
/etc/init.d/nsx-agent restart  # MODERATE risk - briefly interrupts NSX dataplane
```

> **Risk**: Restarting nsx-agent briefly interrupts DFW enforcement and overlay connectivity for VMs on the host. Plan during a maintenance window.

### 6.3 TEP 터널 연결 확인 / TEP Tunnel Connectivity Verification

TEP (Tunnel Endpoint) connectivity is required for overlay traffic between ESXi hosts.

#### 진단 명령 / Diagnostic Commands

```bash
# On ESXi host (SSH) - verify TEP VMkernel adapter
esxcli network ip interface list           # List VMkernel adapters
esxcli network ip interface ipv4 get       # Get VMkernel IPs (find TEP vmk)

# Verify GENEVE tunnel state
esxcli network vswitch dvs vmware vxlan network list --vds-name=<n-vds-name>

# Verify BFD (Bidirectional Forwarding Detection) tunnel health
net-vdl2 -M geneve -l 0                   # List GENEVE network list
esxcfg-vmknic -l | grep tep               # Check TEP vmknic

# Ping between TEP IPs (from ESXi shell)
vmkping -I vmk<N> -d -s 1572 <remote-tep-ip>  # Test with jumbo frame (MTU 1600+)

# Check BFD tunnel status from NSX Manager
get logical-router <lr-id> bgp summary    # For T0 BGP status
```

#### MTU 요구 사항 / MTU Requirements

| Traffic Type | Required MTU |
|-------------|-------------|
| Physical network (uplinks) | 1600+ (recommended 1700) |
| TEP VMkernel adapter | 1600+ |
| GENEVE overhead | 50 bytes additional |

```bash
# Verify MTU on physical uplinks from ESXi
esxcli network nic get -n vmnic0 | grep MTU

# Test GENEVE path MTU (from ESXi shell)
vmkping -I vmk<tep-vmk> -d -s 1550 <remote-tep-ip>
# If this fails but smaller size succeeds, MTU is the issue
```

### 6.4 Fabric Node 상태 조회 / Fabric Node Status Query

**Source**: `python/basics/fabric-nodes.py`

```python
from com.vmware.nsx.model_client import Node

# List all fabric nodes and their connectivity status
result = api_client.fabric.Nodes.list()
for vs in result.results:
    fn = vs.convert_to(Node)
    fn_status = api_client.fabric.nodes.Status.get(fn.id)
    print("Type: %s, Name: %s" % (fn.resource_type, fn.display_name))
    print("  Management Plane conn: %s" % fn_status.mpa_connectivity_status)
    print("  Control Plane conn:    %s" % fn_status.lcp_connectivity_status)
```

**Key Status Values**:
| Status | Meaning |
|--------|---------|
| `CONNECTED` | Node is healthy and communicating |
| `DISCONNECTED` | Node cannot reach NSX Manager (MPA) or Controller (LCP) |
| `UNKNOWN` | Node was never successfully prepared |

### 6.5 논리 엔티티 통계 조회 / Logical Entity Statistics

**Source**: `python/operations/logical-stats.py`

```python
# Get logical switch statistics
all_ls = api_client.LogicalSwitches.list()
for ls in all_ls.results:
    stats = api_client.logical_switches.Statistics.get(ls.id)
    print("Rx packets: total=%s, dropped=%s" % (
          stats.rx_packets.total, stats.rx_packets.dropped))
    print("Tx packets: total=%s, dropped=%s" % (
          stats.tx_packets.total, stats.tx_packets.dropped))
    # Security drop counters
    if stats.dropped_by_security_packets:
        dropped = stats.dropped_by_security_packets
        print("DHCP client dropped IPv4: %d" % dropped.dhcp_client_dropped_ipv4)
        print("Spoof Guard dropped: %s" % dropped.spoof_guard_dropped)

# Get logical router port statistics
all_lrps = api_client.LogicalRouterPorts.list()
for lrp in all_lrps.results:
    stats = api_client.logical_router_ports.Statistics.get(lrp.id, source="cached")
    print("Rx: packets=%s, dropped=%s" % (stats.rx.total_packets, stats.rx.dropped_packets))
    print("Tx: packets=%s, dropped=%s" % (stats.tx.total_packets, stats.tx.dropped_packets))
```

### 6.6 주요 로그 위치 / Key Log Locations

#### NSX Manager (SSH as admin)

| Log File | Content |
|----------|---------|
| `/var/log/vmware/nsx/manager.log` | Manager service events, API errors |
| `/var/log/vmware/nsx/proton.log` | Policy engine, configuration push |
| `/var/log/vmware/nsx/controller.log` | Control plane state distribution |
| `/var/log/vmware/nsx/syslog` | System-level events |
| `/var/log/vmware/nsx/http.log` | HTTP API access log |

#### NSX Edge Node

| Log File | Content |
|----------|---------|
| `/var/log/syslog` | General system events |
| `/var/log/vmware/nsx/router/` | Routing protocol logs (BGP, OSPF) |
| `/var/log/vmware/nsx/edge/` | Edge service logs |

#### ESXi Host (NSX Transport Node)

| Log / Command | Content |
|---------------|---------|
| `/var/log/vmkernel.log` | Kernel-level NSX events, TEP/GENEVE errors |
| `/var/log/hostd.log` | Host daemon, VIB installation events |
| `esxcli network vswitch dvs vmware list` | N-VDS state |
| `/etc/vmware/nsx/` | NSX agent configuration directory |

### 6.7 CRUD 작업 및 412 Precondition Failed / CRUD Operations and 412 Error

**Source**: `python/basics/crud.py`

NSX enforces optimistic concurrency via the `revision` property. Every resource has a `revision` field auto-incremented on each update. If you submit an update with a stale `revision`, NSX returns `412 Precondition Failed`.

```python
from com.vmware.nsx.model_client import TransportZone
from com.vmware.vapi.std.errors_client import NotFound

# Create
new_tz = TransportZone(
    transport_type=TransportZone.TRANSPORT_TYPE_OVERLAY,
    display_name="My Transport Zone",
    description="Demo transport zone"
)
result_tz = api_client.TransportZones.create(new_tz)
tz_id = result_tz.id

# Update — always re-read before updating to get current revision
read_tz = api_client.TransportZones.get(tz_id)
read_tz.description = "Updated description"
updated_tz = api_client.TransportZones.update(tz_id, read_tz)
# Note: revision is automatically incremented by NSX

# If you get 412: re-read the resource and reapply your changes
# Then submit the update again with the new revision value

# Delete
api_client.TransportZones.delete(tz_id)

# Check deletion
try:
    api_client.TransportZones.get(tz_id)
except NotFound:
    print("Transport zone deleted successfully")
```

### 6.8 지원 번들 수집 / Support Bundle Collection

**Source**: `python/operations/support-bundle.py`

```python
from com.vmware.nsx.model_client import (
    SupportBundleRequest, SupportBundleRemoteFileServer,
    SupportBundleFileTransferProtocol,
    SupportBundleFileTransferAuthenticationScheme)

# Get the manager node UUID
mgr_node = api_client.cluster.Nodes.get("self")
mgr_uuid = mgr_node.id

# Configure SCP transfer to remote server
protocol = SupportBundleFileTransferProtocol(
    name="SCP",
    authentication_scheme=SupportBundleFileTransferAuthenticationScheme(
        scheme_name="PASSWORD",
        username=remote_ssh_user,
        password=remote_ssh_password
    ),
    ssh_fingerprint=remote_ssh_fingerprint
)
rfs = SupportBundleRemoteFileServer(
    directory_path="/tmp",
    server=remote_ssh_server,
    protocol=protocol
)
sb_request = SupportBundleRequest(
    log_age_limit=1,   # Days of logs to include
    nodes=[mgr_uuid],
    remote_file_server=rfs
)
resp = api_client.administration.SupportBundles.collect(sb_request)
```

Support bundles can also be collected from the NSX Manager UI under System > Support Bundle.

### 6.9 일반 장애 시나리오 / Common Failure Scenarios

#### DFW 규칙이 예상대로 동작하지 않는 경우 / DFW Rules Not Working as Expected

1. Check that the VM's vNIC has been prepared (Transport Node must be Ready)
2. Verify Applied-To scope: a rule applied to "DFW" applies to all VMs; a rule applied to a specific group applies only to members
3. Check rule priority — higher-priority (lower sequence number) rules take precedence
4. Use Traffic Analysis: NSX Manager > Security > Traffic Analysis (requires NSX Intelligence)
5. Check DFW hit counters (section 4.3) to see if rules are being matched

```bash
# From NSX Manager CLI
get firewall <transport-node-id> ruleset mainrs | grep <rule-id>
```

#### Transport Node 상태가 "부분적으로 성공" / Transport Node "Partially Successful"

```bash
# Check which VIBs failed
esxcli software vib list | grep nsx

# Common causes:
# 1. Host in maintenance mode — exit maintenance mode first
# 2. VIB version conflict — check hardware compatibility with NSX version
# 3. Insufficient disk space on ESXi — check /scratch partition
df -h /scratch
```

#### 오버레이 VM 간 통신 실패 / Overlay VM-to-VM Communication Failure

```bash
# Step 1: Verify TEP connectivity between hosts
vmkping -I vmk<tep-vmk> -d -s 1550 <remote-tep-ip>

# Step 2: Check for MTU issues (fragmentation)
vmkping -I vmk<tep-vmk> -s 8000 <remote-tep-ip>   # Large packet without DF bit
vmkping -I vmk<tep-vmk> -d -s 1600 <remote-tep-ip> # Large packet with DF bit

# Step 3: Verify GENEVE tunnels
net-vdl2 -M geneve -l 0

# Step 4: Check DFW is not blocking (temporarily disable DFW on a segment for testing)
# NSX Manager > Security > Distributed Firewall > Actions > Disable Firewall on Segment
# WARNING: This is a MODERATE risk operation — only in test/lab
```

---

## 7. Terraform / Ansible 자동화 / Infrastructure as Code

### 7.1 Terraform NSX-T Provider

**Source**: `terraform/2-tier-app/main.tf`

The [NSX-T Terraform provider](https://registry.terraform.io/providers/vmware/nsxt/latest/docs) (`vmware/nsxt`) manages NSX-T objects declaratively.

#### Provider 구성 / Provider Configuration

```hcl
terraform {
  required_providers {
    nsxt = {
      source = "vmware/nsxt"
    }
  }
}

provider "nsxt" {
  host                  = "nsxapp-01a.corp.local"
  username              = "admin"
  password              = "VMware1!VMware1!"
  allow_unverified_ssl  = true
  max_retries           = 10
  retry_min_delay       = 500
  retry_max_delay       = 5000
  retry_on_status_codes = [429]  # Rate limit retry
}
```

#### T1 게이트웨이 및 세그먼트 / T1 Gateway and Segments

```hcl
# Reference existing T0 gateway
data "nsxt_policy_tier0_gateway" "t0" {
  display_name = "T0-Paris"
}

# Create T1 gateway connected to T0
resource "nsxt_policy_tier1_gateway" "t1" {
  display_name              = "T1-Paris"
  edge_cluster_path         = data.nsxt_policy_edge_cluster.edgecluster.path
  failover_mode             = "NON_PREEMPTIVE"
  tier0_path                = data.nsxt_policy_tier0_gateway.t0.path
  pool_allocation           = "ROUTING"
  route_advertisement_types = [
    "TIER1_STATIC_ROUTES", "TIER1_CONNECTED",
    "TIER1_NAT", "TIER1_LB_VIP", "TIER1_LB_SNAT"
  ]
}

# Create segments (logical switches)
resource "nsxt_policy_segment" "web_seg" {
  display_name        = "web-seg"
  connectivity_path   = nsxt_policy_tier1_gateway.t1.path
  transport_zone_path = data.nsxt_policy_transport_zone.overlaytz.path
  subnet {
    cidr = "172.16.10.1/24"
  }
}
```

#### 그룹 및 DFW 정책 / Groups and DFW Security Policy

```hcl
# Dynamic group based on VM name
resource "nsxt_policy_group" "web_vms" {
  display_name = "Web-VM-Group"
  criteria {
    condition {
      member_type = "VirtualMachine"
      key         = "Name"
      operator    = "STARTSWITH"
      value       = "Web"
    }
  }
}

# IP-based group
resource "nsxt_policy_group" "mgmt_ip" {
  display_name = "Mgmt-IP-ipset"
  criteria {
    ipaddress_expression {
      ip_addresses = ["192.168.110.10"]
    }
  }
}

# Security policy with multiple rules
resource "nsxt_policy_security_policy" "two_tier_app" {
  display_name = "2Tier App"
  category     = "Application"

  rule {
    display_name       = "Any to Web"
    destination_groups = [nsxt_policy_group.web_vms.path]
    services           = [data.nsxt_policy_service.https.path]
    scope              = [nsxt_policy_group.web_vms.path]
    action             = "ALLOW"
  }
  rule {
    display_name       = "Web to DB"
    source_groups      = [nsxt_policy_group.web_vms.path]
    destination_groups = [nsxt_policy_group.db_vms.path]
    services           = [data.nsxt_policy_service.mysql.path]
    action             = "ALLOW"
  }
  rule {
    display_name = "Deny All"
    scope        = [nsxt_policy_group.web_vms.path, nsxt_policy_group.db_vms.path]
    action       = "REJECT"
  }
}
```

#### DFW 정책 카테고리 / DFW Policy Categories (Evaluation Order)

| Category | Priority | Typical Use |
|----------|----------|-------------|
| `Ethernet` | 1 (highest) | L2 rules |
| `Emergency` | 2 | Quarantine, block-all |
| `Infrastructure` | 3 | DNS, NTP, management access |
| `Environment` | 4 | Prod/Dev isolation |
| `Application` | 5 | App-tier micro-segmentation |
| Default | 6 (lowest) | Default allow/deny |

### 7.2 Ansible NSX-T Modules

**Source**: `ansible/3-tier-app/`
**Collection**: `vmware.ansible_for_nsxt`

#### 플레이북 구조 / Playbook Structure

The 3-tier app example uses modular playbooks chained via `import_playbook`:

```yaml
# 3-tier-app-create.yml — creates entire 3-tier topology
- import_playbook: 3-tier-app-T0-Gateways.yml
  vars:
    state: present
- import_playbook: 3-tier-app-T1-Gateways.yml
  vars:
    state: present
- import_playbook: 3-tier-app-Segments.yml
  vars:
    state: present
- import_playbook: 3-tier-app-Groups.yml
  vars:
    state: present
- import_playbook: 3-tier-app-Security-Policies.yml
  vars:
    state: present
```

#### DFW 보안 정책 플레이북 / DFW Security Policy Playbook

```yaml
# 3-tier-app-Security-Policies.yml
- hosts: localhost
  vars:
    nsx_manager: '10.221.109.5'
    nsx_username: 'admin'
    nsx_password: 'VMware1!VMware1!'
    validate_certs: 'false'
  tasks:
    - name: Security Policy - Infrastructure Rules
      vmware.ansible_for_nsxt.nsxt_policy_security_policy:
        hostname: "{{ nsx_manager }}"
        username: "{{ nsx_username }}"
        password: "{{ nsx_password }}"
        validate_certs: "{{ validate_certs }}"
        state: "{{ state }}"          # 'present' or 'absent'
        display_name: "ANS-Ops"
        domain_id: "default"
        category: "Infrastructure"
        rules:
          - action: "ALLOW"
            display_name: "Allow-ICMP"
            source_groups: ["ANY"]
            destination_groups: ["/infra/domains/default/groups/ANS-all-vms"]
            services: ["/infra/services/ICMP-ALL"]

    - name: Security Policy - Application Rules
      vmware.ansible_for_nsxt.nsxt_policy_security_policy:
        hostname: "{{ nsx_manager }}"
        username: "{{ nsx_username }}"
        password: "{{ nsx_password }}"
        validate_certs: "{{ validate_certs }}"
        state: "{{ state }}"
        display_name: "ANS-Allow-HTTP"
        domain_id: "default"
        category: "Application"
        rules:
          - action: "ALLOW"
            display_name: "allow-80-443"
            source_groups: ["ANY"]
            destination_groups: ["/infra/domains/default/groups/ANS-web-vms"]
            services: ["/infra/services/HTTP", "/infra/services/HTTPS"]
```

#### 설치 / Installation

```bash
# Install the Ansible NSX-T collection
ansible-galaxy collection install vmware.ansible_for_nsxt

# Run the playbook
ansible-playbook 3-tier-app-create.yml
```

---

## 8. References / 참고 자료

### Official Documentation / 공식 문서

| Resource | URL | Description |
|----------|-----|-------------|
| NSX-T API Reference | https://developer.broadcom.com/xapis/nsx-t-data-center-rest-api/latest/ | Full REST API reference |
| NSX-T Documentation | https://docs.vmware.com/en/VMware-NSX-T-Data-Center/ | Official NSX-T product docs |
| NSX-T 3.2 Admin Guide | https://docs.vmware.com/en/VMware-NSX-T-Data-Center/3.2/administration/GUID-FBFD577F-745A-4658-B5D3-82D31B9F38EB.html | NSX-T 3.2 administration |
| Terraform NSX-T Provider | https://registry.terraform.io/providers/vmware/nsxt/latest/docs | Terraform provider docs |
| Ansible for NSX-T | https://github.com/vmware/ansible-for-nsxt | Ansible collection source |

### Sample Code Repository / 샘플 코드 저장소

| Resource | URL | Description |
|----------|-----|-------------|
| vmware-samples/nsx-t | https://github.com/vmware-samples/nsx-t | Official VMware NSX-T sample code |
| python/authentication/ | https://github.com/vmware-samples/nsx-t/tree/master/python/authentication | Auth method examples |
| python/basics/ | https://github.com/vmware-samples/nsx-t/tree/master/python/basics | CRUD, tagging, L3 demo |
| python/operations/ | https://github.com/vmware-samples/nsx-t/tree/master/python/operations | Stats, support bundles |
| helper-scripts/DFW/ | https://github.com/vmware-samples/nsx-t/tree/master/helper-scripts/DFW | DFW backup/restore, per-VM rules, stats |
| helper-scripts/LB/ | https://github.com/vmware-samples/nsx-t/tree/master/helper-scripts/LB | LB certificate replacement |
| terraform/2-tier-app/ | https://github.com/vmware-samples/nsx-t/tree/master/terraform/2-tier-app | Terraform 2-tier app example |
| ansible/3-tier-app/ | https://github.com/vmware-samples/nsx-t/tree/master/ansible/3-tier-app | Ansible 3-tier app example |

### NSX-T + vSphere 통합 관련 / NSX-T + vSphere Integration

| Topic | Reference |
|-------|-----------|
| NSX-T and vSphere 7.0 compatibility | Check VMware Product Interoperability Matrix at https://interopmatrix.vmware.com |
| NSX-T VIB compatibility with ESXi | Verify at NSX-T Release Notes for your version |
| N-VDS to vDS migration (NSX-T 3.0+) | https://docs.vmware.com/en/VMware-NSX-T-Data-Center/3.2/migration/GUID-overview.html |

### 빠른 참조 명령 / Quick Reference Commands

```bash
# NSX Manager CLI (SSH as admin)
get service manager                         # Service status
get cluster status                          # 3-node cluster health
get transport-nodes                         # List all transport nodes
get transport-node <uuid> state             # Individual TN state
get interface eth0                          # Management interface
get route                                   # Routing table
get certificate api thumbprint              # Get API cert thumbprint

# ESXi Host NSX Commands (SSH as root)
esxcli software vib list | grep nsx         # NSX VIBs installed
esxcli network vswitch dvs vmware list      # N-VDS list
net-vdl2 -l                                 # VDL2/GENEVE state
vmkping -I vmk<N> -d -s 1550 <tep-ip>      # TEP MTU test
/etc/init.d/nsx-agent status               # NSX agent status
```
