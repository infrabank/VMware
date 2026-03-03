# Frequently Referenced VMware KB Articles

> Curated list of VMware KB articles commonly needed for vSphere 7.0 administration and troubleshooting.
> KB 번호가 확인된 항목만 수록합니다. 미검증 번호는 절대 포함하지 않습니다.

## Security Hardening & Compliance / 보안 강화 및 컴플라이언스

| Source | Title | Use Case |
|--------|-------|----------|
| [VCF Security & Compliance Guidelines (GitHub)](https://github.com/vmware/vcf-security-and-compliance-guidelines) | VMware VCF Security and Compliance Guidelines — official hardening scripts, SCG controls, ransomware response | VMware 공식 보안 강화 가이드 및 스크립트 전체 참조 |
| [SCG vSphere 7.0 (GitHub)](https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/security-configuration-hardening-guide/vsphere/7.0) | vSphere 7.0 Security Configuration Guide controls and PowerCLI enforcement scripts | ESXi/vCenter/VM SCG 컨트롤 및 적용 스크립트 |
| [Ransomware Resources (GitHub)](https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/ransomware-resources) | ESXiArgs Q&A, protecting vSphere from malware, ransomware resilience guidance | ESXi 랜섬웨어 대응 자료 (ESXiArgs, Nevada 등) |
| [VMware SCG Online](https://core.vmware.com/security-configuration-guide) | VMware vSphere Security Configuration Guide (interactive online version) | SCG 컨트롤 온라인 검색 및 필터링 |
| [VMSA-2021-0002](https://www.vmware.com/security/advisories/VMSA-2021-0002.html) | ESXi OpenSLP Heap Overflow (CVE-2021-21974) — exploited by ESXiArgs ransomware | SLP 취약점 패치 및 완화 (ESXiArgs 캠페인) |
| [VMSA-2021-0010](https://www.vmware.com/security/advisories/VMSA-2021-0010.html) | vCenter vSAN Health Check Plugin RCE (CVE-2021-21985) | vCenter 플러그인 RCE 패치 |
| [VMSA-2021-0020](https://www.vmware.com/security/advisories/VMSA-2021-0020.html) | vCenter Analytics Service File Upload RCE (CVE-2021-22005) | vCenter Analytics RCE 즉시 완화 및 패치 |
| [VMSA-2022-0011](https://www.vmware.com/security/advisories/VMSA-2022-0011.html) | Workspace ONE Access SSTI RCE (CVE-2022-22954) | Workspace ONE/Identity Manager RCE 패치 |
| [VMSA-2023-0023](https://www.vmware.com/security/advisories/VMSA-2023-0023.html) | vCenter DCERPC Out-of-Bounds Write RCE (CVE-2023-34048) — exploited by APT | APT 악용 vCenter RCE 패치 |
| [VMSA-2024-0006](https://www.vmware.com/security/advisories/VMSA-2024-0006.html) | ESXi USB Controller Use-After-Free VM Escape (CVE-2024-22252/22253) — Pwn2Own | USB 컨트롤러 VM 탈출 취약점 패치 |
| [VMSA-2024-0013](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/24505) | ESXi AD Authentication Bypass (CVE-2024-37085) — ransomware groups | 랜섬웨어 그룹 악용 AD 인증 우회 패치 |
| [CISAGOV ESXiArgs-Recover (GitHub)](https://github.com/cisagov/ESXiArgs-Recover) | CISA ESXiArgs recovery script for partially encrypted VMs | ESXiArgs 감염 VM 복구 스크립트 (CISA 제공) |
| [DISA STIG vSphere 7.0](https://public.cyber.mil/stigs/downloads/) | DISA Security Technical Implementation Guide for VMware vSphere 7.0 ESXi | 미국방부 STIG 준수 점검 기준 |
| [CIS VMware ESXi 7 Benchmark](https://www.cisecurity.org/benchmark/vmware) | CIS Benchmark for VMware ESXi 7 | CIS 벤치마크 기반 ESXi 보안 기준선 |

---

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
| [KB 2032823](https://kb.vmware.com/s/article/2032823) | ESXi host in "Not Responding" state | 호스트 응답 없음 상태 진단 |

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
| [KB 1003728](https://kb.vmware.com/s/article/1003728) | Jumbo frames configuration | MTU configuration |
| [KB 2008226](https://kb.vmware.com/s/article/2008226) | VMkernel network configuration | VMkernel adapter troubleshooting |
| [KB 1003804](https://kb.vmware.com/s/article/1003804) | vSwitch / port group configuration | 가상 스위치 구성 문제 |

---

## vMotion & Migration

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1003684](https://kb.vmware.com/s/article/1003684) | vMotion fails with general error | vMotion troubleshooting |
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

## Performance Tuning

| KB | Title | Use Case |
|----|-------|----------|
| [KB 2032076](https://kb.vmware.com/s/article/2032076) | Using esxtop to identify storage bottlenecks | esxtop 스토리지 성능 분석 |
| [KB 1006279](https://kb.vmware.com/s/article/1006279) | Interpreting esxtop statistics | esxtop 전체 메트릭 해석 |
| [KB 2010200](https://kb.vmware.com/s/article/2010200) | Collecting esxtop statistics for analysis | esxtop 배치 수집 방법 |
| [KB 1027734](https://kb.vmware.com/s/article/1027734) | Using vmkfstools | vmkfstools 전체 레퍼런스 |
| [KB 2146005](https://kb.vmware.com/s/article/2146005) | PVSCSI performance best practices | PVSCSI 권장 설정 |
| [KB 1010877](https://kb.vmware.com/s/article/1010877) | VMXNET3 best practices | VMXNET3 권장 설정 |
| [KB 1004087](https://kb.vmware.com/s/article/1004087) | Storage I/O Control FAQ | SIOC 구성 가이드 |
| [KB 2054994](https://kb.vmware.com/s/article/2054994) | NUMA topology and VM sizing | NUMA 최적화 |
| [KB 1033665](https://kb.vmware.com/s/article/1033665) | CPU ready time and ready time percentage | %RDY 해석 |
| [KB 2019021](https://kb.vmware.com/s/article/2019021) | Memory overhead per virtual machine | VM 메모리 오버헤드 계산 |

---

## Patching & Upgrade

| KB | Title | Use Case |
|----|-------|----------|
| [KB 78057](https://kb.vmware.com/s/article/78057) | Smart Card/RSA config before upgrade | Pre-upgrade check |
| [KB 83042](https://kb.vmware.com/s/article/83042) | VIB checksum errors in vLCM | vLCM remediation failures |
| [KB 2118543](https://kb.vmware.com/s/article/2118543) | AD domain joining issues during migration | vCenter migration issues |
| [KB 2058352](https://kb.vmware.com/s/article/2058352) | vCenter upgrade/migration paths | Upgrade compatibility |

---

## vCenter Services

| KB | Title | Use Case |
|----|-------|----------|
| [KB 2146224](https://kb.vmware.com/s/article/2146224) | vCenter services fail to start after reboot | Service troubleshooting |
| [KB 2109074](https://kb.vmware.com/s/article/2109074) | VCSA disk partition full | Disk space issues |
| [KB 2091961](https://kb.vmware.com/s/article/2091961) | Resetting SSO admin password | Password reset |

---

## HA & DRS

| KB | Title | Use Case |
|----|-------|----------|
| [KB 1004250](https://kb.vmware.com/s/article/1004250) | HA and DRS operations troubleshooting | HA/DRS general troubleshooting |
| [KB 2012069](https://kb.vmware.com/s/article/2012069) | HA failover and isolation response | HA 페일오버 동작 이해 |

---

## Backup & Disaster Recovery

| KB | Title | Use Case |
|----|-------|----------|
| [KB 2147289](https://kb.vmware.com/s/article/2147289) | VADP overview and transport modes | VADP 프레임워크 및 전송 모드 이해 |
| [KB 2057795](https://kb.vmware.com/s/article/2057795) | CBT reset procedure | 손상된 CBT 초기화 절차 |
| [KB 2006849](https://kb.vmware.com/s/article/2006849) | vCenter file-based backup and restore | VAMI 파일 기반 백업 및 복구 |
| [KB 84650](https://kb.vmware.com/s/article/84650) | vSphere Replication RPO and bandwidth | 복제 RPO 및 대역폭 요구사항 |
| [KB 2135378](https://kb.vmware.com/s/article/2135378) | Snapshot consolidation best practices | 스냅샷 통합 모범 사례 |
| [KB 2010202](https://kb.vmware.com/s/article/2010202) | Quiesced snapshot failures | 퀴싱 스냅샷 실패 진단 |
| [KB 1020128](https://kb.vmware.com/s/article/1020128) | ESXi configuration backup | ESXi 호스트 구성 백업 |

---

## VMware Tools

| KB | Title | Use Case |
|----|-------|----------|
| [KB 340](https://kb.vmware.com/s/article/340) | VMware Tools release and build numbers | Tools 버전 및 빌드 번호 매핑 |
| [KB 2150799](https://kb.vmware.com/s/article/2150799) | VMware Tools compatibility matrix | vSphere 버전별 Tools 호환성 |
| [KB 2129825](https://kb.vmware.com/s/article/2129825) | open-vm-tools support for Linux | Linux open-vm-tools 지원 범위 |
| [KB 2007849](https://kb.vmware.com/s/article/2007849) | Guest OS customization requirements | Sysprep / cloud-init 요구사항 |
| [KB 1018722](https://kb.vmware.com/s/article/1018722) | Disabling VMware Tools time sync | Tools 시간 동기화 비활성화 |
| [KB 2107796](https://kb.vmware.com/s/article/2107796) | VMware Tools quiescing failures | VSS / pre-freeze 퀴싱 실패 진단 |
| [KB 2146192](https://kb.vmware.com/s/article/2146192) | PVSCSI driver performance best practices | PVSCSI 성능 권장 설정 |
| [KB 1001805](https://kb.vmware.com/s/article/1001805) | VMXNET3 adapter overview | VMXNET3 드라이버 개요 및 설정 |

---

## PowerCLI & Automation

| Source | Title | Use Case |
|--------|-------|----------|
| [VMware PowerCLI Docs](https://developer.vmware.com/powercli) | VMware PowerCLI Documentation | PowerCLI cmdlet reference & user guide |
| [PowerShell Gallery](https://www.powershellgallery.com/packages/VMware.PowerCLI) | VMware.PowerCLI on PowerShell Gallery | Installation & version history |
| [PowerCLI Release Notes](https://developer.vmware.com/powercli/release-notes) | PowerCLI Release Notes | Version compatibility matrix |
| [PowerCLI Community Blog](https://blogs.vmware.com/PowerCLI) | VMware PowerCLI Blog | Scripts, tips, best practices |

---

## AIOps & Automation

| Source | Title | Use Case |
|--------|-------|----------|
| [VMware-AIops (GitHub)](https://github.com/zw008/VMware-AIops) | AI-powered VMware vCenter/ESXi monitoring & operations | pyVmomi 기반 AIOps 자동화 전체 참조 |
| [pyVmomi](https://github.com/vmware/pyvmomi) | VMware vSphere API Python Bindings | vSphere SOAP API Python 연동 |
| [pyVmomi Community Samples](https://github.com/vmware/pyvmomi-community-samples) | Official VMware pyVmomi code samples | OVA/OVF 배포, 성능 수집, FCD, vSAN 자동화 코드 패턴 참조 |
| [vSphere Web Services API](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/) | vSphere Web Services SDK Reference | pyVmomi API 객체 및 메서드 레퍼런스 |
| [vSAN Management SDK](https://developer.broadcom.com/sdks/vsan-management-sdk-for-python/latest/) | vSAN Management SDK for Python | vSAN 헬스/용량/성능 자동화 |
| [Aria Operations API](https://developer.broadcom.com/xapis/vmware-aria-operations-api/latest/) | VMware Aria Operations REST API | 이상 탐지, 용량 계획, 지능형 알람 |
| [VKS API](https://developer.broadcom.com/xapis/vmware-vsphere-kubernetes-service/3.6.0/api-docs.html) | vSphere Kubernetes Service API | Tanzu K8s 클러스터 관리 자동화 |
| [VCF 9.0 API](https://developer.broadcom.com/sdks/vcf-api-specification/latest/) | VMware Cloud Foundation API Spec | VCF Operations 통합 |

### 주요 이벤트 타입 (모니터링 자동화용)

| 카테고리 | 이벤트 타입 | 심각도 |
|----------|------------|--------|
| VM 장애 | `VmFailedToPowerOnEvent`, `VmDiskFailedEvent` | Critical |
| 호스트 | `HostConnectionLostEvent`, `HostShutdownEvent`, `DasHostFailedEvent` | Critical |
| 스토리지 | `DatastoreRemovedOnHostEvent` | Critical |
| DRS/HA | `VmFailoverFailed`, `DrsVmMigratedEvent`, `DrsSoftRuleViolationEvent` | Warning |
| 네트워크 | `DVPortGroupReconfiguredEvent`, `HostIpChangedEvent` | Warning |
| 인증 | `BadUsernameSessionEvent`, `UserLoginSessionEvent` | Warning/Info |

### pyVmomi 연결 패턴 (vSphere 8.0 호환)

```python
# vSphere 8.0: SmartConnectNoSSL() 제거됨 → 아래 패턴 사용
import ssl
from pyVim.connect import SmartConnect, Disconnect

context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

si = SmartConnect(
    host="vcenter.example.com",
    user="administrator@vsphere.local",
    pwd="password",
    port=443,
    sslContext=context,
    disableSslCertValidation=True,  # vSphere 7.0/8.0 자체 서명 인증서
)
```

### 스캔 로그 패턴 (ESXi 호스트 로그)

```python
# 오류 패턴 키워드 (hostd, vmkernel, vpxa 로그 분석)
ERROR_PATTERNS = [
    "error", "fail", "critical", "panic", "lost access",
    "cannot", "timeout", "refused", "corrupt",
]
# 진단 로그 접근
diag_mgr = host.configManager.diagnosticSystem
log_data = diag_mgr.BrowseDiagnosticLog(key="hostd", start=500)
```

---

## NSX-T Networking & Automation

> NSX-T 관련 공식 문서 및 샘플 코드 참조. KB 번호가 없는 항목은 공식 문서 링크로 대체합니다.

| Source | Title | Use Case |
|--------|-------|----------|
| [NSX-T API Reference](https://developer.broadcom.com/xapis/nsx-t-data-center-rest-api/latest/) | NSX-T Data Center REST API | NSX Policy API 전체 엔드포인트 레퍼런스 |
| [NSX-T Documentation](https://docs.vmware.com/en/VMware-NSX-T-Data-Center/) | VMware NSX-T Data Center Docs | 공식 NSX-T 제품 문서 (아키텍처, 운영, 트러블슈팅) |
| [vmware-samples/nsx-t (GitHub)](https://github.com/vmware-samples/nsx-t) | NSX-T Sample Code | Python/Terraform/Ansible/PowerCLI NSX-T 자동화 샘플 |
| [Terraform NSX-T Provider](https://registry.terraform.io/providers/vmware/nsxt/latest/docs) | VMware NSX-T Terraform Provider | Terraform으로 T0/T1/Segment/DFW/LB 선언적 관리 |
| [ansible-for-nsxt (GitHub)](https://github.com/vmware/ansible-for-nsxt) | Ansible for NSX-T | `vmware.ansible_for_nsxt` 컬렉션 — 게이트웨이, 세그먼트, DFW 자동화 |
| [Interoperability Matrix](https://interopmatrix.vmware.com) | VMware Product Interoperability Matrix | NSX-T와 vSphere/ESXi 버전 호환성 확인 |

### NSX-T DFW 운영 / DFW Operations Quick Reference

| Script | Source File | Purpose |
|--------|-------------|---------|
| DFW 백업/복구 | `helper-scripts/DFW/nsx-dfw-backup-n-restore.py` | Policy, Rules, Groups, L4/L7 서비스 전체 백업 및 복구 |
| VM별 규칙 검사 | `helper-scripts/DFW/nsx-get-dfw-rules-per-vm.py` | VM vNIC당 DFW 규칙 수 조회 (4K 한도 모니터링) |
| DFW 통계 조회 | `helper-scripts/DFW/nsx-get-dfw-firewall-stats.py` | 규칙별 Hit Count 조회 (미사용 규칙 식별) |
| VM 태그 백업/복구 | `helper-scripts/DFW/nsx-vm-tag-backup-n-restore.py` | VM 태그 백업 및 Instance UUID 기반 복구 (SRM 연동) |
| LB 인증서 교체 | `helper-scripts/LB/ReplaceCerts/replace_cert_in_nsx_vip.py` | LB VIP TLS 인증서 무중단 교체 |

### NSX-T 핵심 API 엔드포인트 / Key API Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| DFW 정책 전체 백업 | GET | `/policy/api/v1/infra?filter=Type-Domain\|SecurityPolicy\|Rule\|Group` |
| DFW 정책 복구 (Bulk PATCH) | PATCH | `/policy/api/v1/infra` |
| DFW 통계 조회 | GET | `/policy/api/v1/infra/domains/default/security-policies/<id>/statistics` |
| VM Fabric 인벤토리 | GET | `/api/v1/fabric/virtual-machines` |
| VM 태그 할당 | POST | `/api/v1/fabric/virtual-machines?action=add_tags` |
| Transport Zone 목록 | GET | `/api/v1/transport-zones` |
| Fabric 노드 목록 | GET | `/api/v1/fabric/nodes` |
| Fabric 노드 상태 | GET | `/api/v1/fabric/nodes/<id>/status` |
| 논리 스위치 통계 | GET | `/api/v1/logical-switches/<id>/statistics` |
| 인증서 목록 | GET | `/api/v1/trust-management/certificates` |
| 지원 번들 수집 | POST | `/api/v1/administration/support-bundles?action=collect` |
| LB 서비스 상태 | GET | `/policy/api/v1/infra/lb-services/<id>/detailed-status` |

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
