# vSphere 7.0 Security Hardening Guide / 보안 강화 가이드

> Reference: [VMware vSphere 7.0 Security Configuration Guide](https://core.vmware.com/security-configuration-guide), [DISA STIG for VMware vSphere 7.0](https://public.cyber.mil/stigs/downloads/), [CIS VMware ESXi 7 Benchmark](https://www.cisecurity.org/benchmark/vmware)

---

## 1. 개요 / Overview

vSphere 보안 강화는 심층 방어(Defense in Depth) 원칙을 기반으로 한다. 단일 계층의 통제에만 의존하지 않고, 호스트, 네트워크, 관리 플레인, 인증 계층 각각에 독립적인 보안 통제를 적용한다.

vSphere security hardening is based on the Defense in Depth principle. Rather than relying on any single control layer, independent security controls are applied across the host, network, management plane, and authentication layers.

### 표준 참조 / Compliance References

| 표준 / Standard | 문서 / Document | 적용 대상 / Scope |
|-----------------|-----------------|-------------------|
| DISA STIG | VMware vSphere 7.0 ESXi STIG V1R2 | ESXi hosts, vCenter |
| CIS Benchmark | CIS VMware ESXi 7 Benchmark v1.0.0 | ESXi hosts |
| VMware SCG | vSphere 7.0 Security Configuration Guide | Full vSphere stack |
| NIST SP 800-125B | Secure Virtual Network Configuration | Virtual networking |

### 강화 우선순위 / Hardening Priority

1. **Critical** — 패치 적용, 관리 네트워크 격리, Lockdown Mode 활성화
2. **High** — SSH/Shell 비활성화, 강력한 패스워드 정책, Syslog 전달
3. **Medium** — TLS 버전 제한, 미사용 서비스 비활성화, 감사 로깅
4. **Low** — 배너 설정, SNMP 커뮤니티 문자열 변경

---

## 2. ESXi 호스트 보안 / ESXi Host Security

### 2.1 Lockdown Mode

Lockdown Mode는 ESXi 호스트에 대한 직접 접근을 제한하고, 모든 작업을 vCenter를 통해서만 수행하도록 강제한다.

Lockdown Mode restricts direct access to ESXi hosts and forces all operations through vCenter.

| 모드 / Mode | 동작 / Behavior | 권장 환경 / Recommended For |
|-------------|-----------------|------------------------------|
| **Normal Lockdown** | vCenter API 허용; DCUI root 접근 허용 | 대부분의 프로덕션 환경 |
| **Strict Lockdown** | vCenter API만 허용; DCUI 완전 차단 | 고보안 환경 (단, 비상복구 고려 필요) |

```bash
# Lockdown Mode 활성화 (esxcli via vCenter or direct SSH)
vim-cmd hostsvc/enable_normal_lockdown

# Strict Lockdown 활성화
vim-cmd hostsvc/enable_strict_lockdown

# Lockdown Mode 비활성화
vim-cmd hostsvc/disable_lockdown

# 현재 상태 확인
vim-cmd hostsvc/get_lockdown
```

```powershell
# PowerCLI: Lockdown Mode 활성화
$vmhost = Get-VMHost -Name "esxi01.example.com"
$vmhost | Get-View | ForEach-Object { $_.EnterLockdownMode() }

# 상태 확인
(Get-VMHost -Name "esxi01.example.com").ExtensionData.Config.LockdownMode
```

**Exception Users (예외 사용자)**: Lockdown Mode에서도 접근이 필요한 계정(모니터링 서비스 계정 등)은 DCUI Access 예외 목록에 등록한다.

```bash
# 예외 사용자 목록 확인 (vSphere Client: Host > Configure > Security Profile > Lockdown Mode > Exception Users)
# PowerCLI로 확인
(Get-VMHost "esxi01").ExtensionData.Config.AdminDisabled
```

> **STIG**: ESXI-70-000001 — Lockdown Mode must be enabled on all ESXi hosts.

---

### 2.2 SSH 강화 / SSH Hardening

SSH는 기본적으로 비활성화 상태를 유지해야 한다. 긴급 트러블슈팅 시에만 임시 활성화하고, 작업 완료 후 즉시 비활성화한다.

SSH must remain disabled by default. Enable temporarily only for emergency troubleshooting, then disable immediately after.

```bash
# SSH 서비스 상태 확인
esxcli system maintenanceMode get
vim-cmd hostsvc/get_ssh_info

# SSH 비활성화 (권장 기본값)
vim-cmd hostsvc/stop_ssh
vim-cmd hostsvc/disable_ssh

# SSH 활성화 (임시 - 트러블슈팅 시)
vim-cmd hostsvc/start_ssh
vim-cmd hostsvc/enable_ssh
```

```powershell
# PowerCLI: SSH 비활성화
Get-VMHost "esxi01" | Get-VMHostService | Where-Object { $_.Key -eq "TSM-SSH" } | Stop-VMHostService -Confirm:$false
Get-VMHost "esxi01" | Get-VMHostService | Where-Object { $_.Key -eq "TSM-SSH" } | Set-VMHostService -Policy Off
```

**SSH 세션 타임아웃 설정**:

```bash
# SSH 인터랙티브 세션 타임아웃 (초) - 기본값 0 (무제한), 권장값 900
esxcli system settings advanced set -o /UserVars/ESXiShellInteractiveTimeOut -i 900

# SSH 데몬 전체 타임아웃 (초) - 기본값 0, 권장값 600
esxcli system settings advanced set -o /UserVars/ESXiShellTimeOut -i 600

# 설정 확인
esxcli system settings advanced list | grep -i shelltimeout
esxcli system settings advanced list -o /UserVars/ESXiShellInteractiveTimeOut
esxcli system settings advanced list -o /UserVars/ESXiShellTimeOut
```

> **CIS**: 3.1 — Set a timeout for the ESXi Shell.
> **STIG**: ESXI-70-000042 — ESXiShellInteractiveTimeOut must be set to 600 or less.

---

### 2.3 DCUI 타임아웃 / DCUI Timeout

```bash
# DCUI(Direct Console User Interface) 타임아웃 설정 (초)
esxcli system settings advanced set -o /UserVars/DcuiTimeOut -i 600

# 확인
esxcli system settings advanced list -o /UserVars/DcuiTimeOut
```

---

### 2.4 패스워드 정책 / Password Policy

```bash
# 패스워드 복잡도 정책 설정 (pam_passwdqc 형식)
# 권장: 최소 15자, 대/소문자/숫자/특수문자 조합 필수
esxcli system settings advanced set \
  -o /Security/PasswordQualityControl \
  -s "min=disabled,disabled,disabled,disabled,15"

# 현재 설정 확인
esxcli system settings advanced list -o /Security/PasswordQualityControl

# 패스워드 최대 사용 기간 설정 (일) - 권장값 90
esxcli system settings advanced set -o /Security/PasswordMaxDays -i 90

# 패스워드 이력 관리 (재사용 방지 횟수) - 권장값 5
esxcli system settings advanced set -o /Security/PasswordHistory -i 5
```

**PasswordQualityControl 문법 설명**:
- `min=N1,N2,N3,N4,N5`: 각 문자 클래스 조합별 최소 길이
  - N1: 한 가지 클래스, N2: 두 가지 클래스, ... N5: 세 단어 구문
- `disabled`: 해당 조합 금지
- `max=N`: 최대 길이

> **STIG**: ESXI-70-000031 — Password complexity must be enforced.

---

### 2.5 계정 잠금 정책 / Account Lockout Policy

```bash
# 로그인 실패 잠금 임계값 (기본값 5, 권장값 3~5)
esxcli system settings advanced set -o /Security/AccountLockFailures -i 3

# 계정 잠금 해제 대기 시간 (초) - 권장값 900
esxcli system settings advanced set -o /Security/AccountUnlockTime -i 900

# 설정 확인
esxcli system settings advanced list -o /Security/AccountLockFailures
esxcli system settings advanced list -o /Security/AccountUnlockTime
```

```bash
# 현재 잠긴 계정 확인 및 해제
pam_tally2 --user root               # 잠금 횟수 확인 (ESXi Shell)
pam_tally2 --user root --reset       # 잠금 해제
```

> **STIG**: ESXI-70-000005 — Account lock must trigger after 3 failures.

---

### 2.6 방화벽 규칙 관리 / Firewall Rule Management

```bash
# 전체 방화벽 규칙 목록 확인
esxcli network firewall ruleset list

# 특정 서비스 방화벽 규칙 활성화/비활성화
esxcli network firewall ruleset set --ruleset-id sshClient --enabled false
esxcli network firewall ruleset set --ruleset-id ntpClient --enabled true

# 특정 규칙에 허용 IP 범위 제한 (allIPs=false 설정 후 IP 추가)
esxcli network firewall ruleset set --ruleset-id sshServer --allowed-all false
esxcli network firewall ruleset allowedip add --ruleset-id sshServer --ip-address 10.10.0.0/24

# 현재 허용된 IP 확인
esxcli network firewall ruleset allowedip list --ruleset-id sshServer

# 방화벽 상태 확인 (전체)
esxcli network firewall get

# 방화벽 활성화
esxcli network firewall set --enabled true
```

**관리 대역 제한 권장 서비스**:

| 서비스 / Service | Ruleset ID | 권장 설정 |
|------------------|------------|-----------|
| SSH Server | `sshServer` | 관리 IP만 허용 또는 비활성화 |
| vSphere Client (HTTPS) | `webAccess` | 관리 IP만 허용 |
| NTP Client | `ntpClient` | 활성화 (NTP 서버 IP 지정) |
| Syslog | `syslog` | 활성화 |
| CIM | `CIMHttpServer`, `CIMHttpsServer` | 불필요 시 비활성화 |
| vSAN Health | `vsanHealth` | vSAN 미사용 시 비활성화 |

---

### 2.7 MOB 비활성화 / Disable Managed Object Browser

MOB(Managed Object Browser)는 디버깅 도구로, 프로덕션 환경에서는 반드시 비활성화해야 한다.

```bash
# MOB 비활성화
esxcli system settings advanced set -o /Config/HostAgent/plugins/solo/enableMob -i 0

# 확인
esxcli system settings advanced list -o /Config/HostAgent/plugins/solo/enableMob
```

> **CIS**: 5.6 — Disable the Managed Object Browser (MOB).

---

### 2.8 Shell 경고 배너 억제 / Suppress Shell Warning

SSH/Shell 활성화 시 vCenter 알람이 발생한다. 정책적으로 필요한 경우 억제 가능하나, 기본적으로는 경고를 유지하는 것을 권장한다.

```bash
# Shell 경고 억제 (권장하지 않음 - 감사 목적으로 경고 유지)
esxcli system settings advanced set -o /UserVars/SuppressShellWarning -i 1

# 경고 복원 (권장 기본값 = 0)
esxcli system settings advanced set -o /UserVars/SuppressShellWarning -i 0
```

---

### 2.9 SNMP 비활성화 / Disable SNMP

SNMP를 사용하지 않는 경우 반드시 비활성화한다. 사용하는 경우 SNMPv3를 권장하며, v1/v2c community string을 기본값(public/private)에서 변경해야 한다.

```bash
# SNMP 서비스 비활성화
esxcli system snmp set --enable false

# SNMP 상태 확인
esxcli system snmp get

# SNMPv3 설정 (사용이 필요한 경우)
esxcli system snmp set --enable true
esxcli system snmp set --communities ""                   # v1/v2c community 제거
esxcli system snmp set --v3targets <target-ip>@<port>/<type>/<sec-name>/<auth-proto>/<priv-proto>
```

---

### 2.10 영구 로깅 / Persistent Logging

ESXi는 기본적으로 메모리 내에 로그를 저장하므로, 재부팅 시 손실된다. Syslog를 외부 서버로 전달하거나, 로컬 영구 저장소에 저장해야 한다.

```bash
# 원격 Syslog 서버 설정 (UDP, TCP, SSL 지원)
esxcli system syslog config set --loghost="udp://syslog.example.com:514"
esxcli system syslog config set --loghost="ssl://syslog.example.com:1514"

# 복수 Syslog 서버 지정 (쉼표 구분)
esxcli system syslog config set --loghost="udp://syslog1.example.com:514,udp://syslog2.example.com:514"

# Syslog 설정 적용
esxcli system syslog reload

# 설정 확인
esxcli system syslog config get

# 로컬 영구 로그 저장 경로 설정 (데이터스토어)
esxcli system syslog config set --logdir="/vmfs/volumes/<datastore-name>/logs"

# 로그 로테이션 설정
esxcli system syslog config set --logsize=1024 --rotate=20
```

> **STIG**: ESXI-70-000004 — ESXi must offload logs to a central log server.

---

## 3. vCenter 보안 / vCenter Security

### 3.1 SSO 패스워드 정책 / SSO Password Policy

```bash
# VCSA SSH에서 SSO 패스워드 정책 확인
/usr/lib/vmware-sso/bin/sso-config.sh -get_password_policy
```

```powershell
# PowerCLI: SSO 패스워드 정책 설정
$ssoPolicy = Get-SsoPasswordPolicy
$ssoPolicy.MinLength = 15
$ssoPolicy.MaxLength = 64
$ssoPolicy.MinNumericCount = 1
$ssoPolicy.MinSpecialCharCount = 1
$ssoPolicy.MaxIdenticalAdjacentCharacters = 3
$ssoPolicy.MinUppercaseCount = 1
$ssoPolicy.MinLowercaseCount = 1
$ssoPolicy.PasswordLifetimeDays = 90
Set-SsoPasswordPolicy -Policy $ssoPolicy
```

---

### 3.2 세션 타임아웃 / Session Timeout

```bash
# vSphere Client 세션 타임아웃 확인 (기본값 120분)
# VCSA: /etc/vmware/vsphere-ui/webclient.properties 에서 설정
grep -i timeout /etc/vmware/vsphere-ui/webclient.properties

# 타임아웃 변경 (분 단위, 권장값 15-30)
# vSphere Client (H5): Administration > Client Configuration > Timeout
```

```powershell
# PowerCLI: SSO 잠금 정책 설정
$lockoutPolicy = Get-SsoLockoutPolicy
$lockoutPolicy.MaxFailedAttempts = 3
$lockoutPolicy.FailedAttemptIntervalSec = 180
$lockoutPolicy.AutoUnlockIntervalSec = 300
Set-SsoLockoutPolicy -Policy $lockoutPolicy
```

---

### 3.3 VCSA root 패스워드 만료 관리 / VCSA Root Password Expiry

VCSA root 계정의 패스워드 만료는 서비스 중단의 흔한 원인이다. 주기적으로 확인하고 갱신해야 한다.

```bash
# root 패스워드 만료일 확인
chage -l root

# 패스워드 만료 설정 (일 단위, -1 = 만료 없음)
chage -M 90 root                    # 90일 후 만료
chage -M -1 root                    # 만료 없음 (서비스 계정 권장)
chage -d 0 root                     # 즉시 변경 강제

# 패스워드 변경
passwd root
```

**vCenter API를 통한 패스워드 만료 관리**:

```bash
# vCenter Appliance Management Interface (VAMI) - 포트 5480
# https://<vcsa-fqdn>:5480 > Administration > Password Expiration

# VAMI API (curl)
curl -k -u root:<password> \
  "https://localhost:5480/api/appliance/local-accounts/root" | python3 -m json.tool

# 패스워드 만료 비활성화 (API)
curl -k -u root:<password> -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"password_expires": false}' \
  "https://localhost:5480/api/appliance/local-accounts/root"
```

> **Reference**: KB 88282 — VCSA root password expiration and management

---

### 3.4 VCSA Shell 접근 제한 / Restrict VCSA Shell Access

```bash
# Bash shell 접근 비활성화 (기본값: 비활성화 권장)
# VCSA 기본 shell은 'appliancesh' (제한된 명령만 허용)
# bash를 활성화하면 전체 OS 접근 가능 — 트러블슈팅 후 반드시 비활성화

# 현재 기본 shell 확인
chsh -l root       # 또는
getent passwd root | cut -d: -f7

# bash 접근 비활성화 (appliancesh로 복원)
chsh -s /bin/appliancesh root

# bash 임시 활성화 (트러블슈팅 시)
chsh -s /bin/bash root
```

---

### 3.5 TLS 구성 및 암호화 관리 / TLS Configuration

```bash
# 현재 TLS 설정 확인
/usr/lib/vmware-TlsReconfigurator/VcTlsReconfigurator/reconfigureVc query

# TLS 1.0/1.1 비활성화, TLS 1.2만 허용
/usr/lib/vmware-TlsReconfigurator/VcTlsReconfigurator/reconfigureVc reconfigure --tls TLS_1.2

# 변경 후 서비스 재시작 필요
service-control --stop --all
service-control --start --all
```

**ESXi TLS 설정**:

```bash
# ESXi에서 TLS 1.0/1.1 비활성화 (고급 설정)
esxcli system settings advanced set -o /UserVars/ESXiVPsDisabledProtocols -s "sslv3,tlsv1,tlsv1.1"

# 설정 확인
esxcli system settings advanced list -o /UserVars/ESXiVPsDisabledProtocols
```

> **Reference**: KB 2148819 — Disabling weak TLS protocols in vSphere

---

### 3.6 미사용 vCenter 플러그인 비활성화 / Disable Unused vCenter Plugins

```bash
# 설치된 플러그인 목록 확인
# vSphere Client: Administration > Solutions > Client Plugins

# 플러그인 비활성화 (VCSA SSH)
/usr/lib/vmware-lookupsvc/tools/lstool.py list \
  --url https://localhost/lookupservice/sdk --no-check-cert 2>/dev/null
```

---

## 4. AD 통합 보안 / AD Integration Security

### 4.1 VMSA-2024-0013 / CVE-2024-37085 위험 / Risk

**CVE-2024-37085**는 AD에 조인된 ESXi 호스트에서 공격자가 AD에 "ESX Admins" 그룹을 생성하면 자동으로 ESXi 관리자 권한을 획득하는 취약점이다. 랜섬웨어 그룹(Storm-0506, Akira, Black Basta)에 의해 실제 공격에 활용되었다.

CVE-2024-37085 is a critical authentication bypass affecting AD-joined ESXi hosts. An attacker who creates an "ESX Admins" group in Active Directory automatically gains full ESXi admin privileges. Actively exploited by ransomware groups.

```bash
# 영향을 받는 버전
# ESXi 7.0 < U3r (build 24411414)
# ESXi 8.0 < U2d

# 패치 확인
esxcli system version get

# 임시 완화 조치 (패치 전)
# AD 그룹 이름을 "ESX Admins"에서 다른 이름으로 변경하고 ESXi에 재등록
# AD 조인 상태 확인
esxcli system secpolicy document get
```

---

### 4.2 ESXi AD 조인 보안 고려사항 / ESXi AD Join Security

```bash
# AD 조인 상태 확인
esxcli system secpolicy document get
# 또는 vSphere Client: Host > Configure > Authentication Services

# AD 도메인 조인 (esxcli)
esxcli system secpolicy domain join \
  --domain example.com \
  --username administrator@example.com \
  --password <password>

# AD 도메인 탈퇴
esxcli system secpolicy domain leave \
  --username administrator@example.com \
  --password <password>
```

**AD 조인 보안 권장사항**:

| 항목 | 권장사항 |
|------|----------|
| 관리자 그룹 이름 | "ESX Admins" 대신 환경 고유 이름 사용 |
| 서비스 계정 | 최소 권한 전용 ESXi 서비스 계정 사용 |
| 패스워드 정책 | AD 정책과 동기화 |
| 잠금 정책 | ESXi AccountLockFailures와 AD 정책 일치 권장 |

---

### 4.3 대안: ID 페더레이션 / Alternative: Identity Federation

vSphere 7.0은 ADFS, Okta, PingFederate 등 외부 IdP와의 OIDC 페더레이션을 지원한다. 이 방식은 AD 직접 조인 없이 MFA를 강제할 수 있는 권장 대안이다.

```powershell
# PowerCLI: Identity Federation 구성 (ADFS 예시)
# vSphere Client: Administration > Single Sign On > Configuration > Identity Provider
# 또는 API를 통한 구성
```

---

## 5. 감사 및 로깅 / Audit & Logging

### 5.1 ESXi Syslog 전달 / ESXi Syslog Forwarding

```bash
# Syslog 서버 설정 (UDP/TCP/SSL)
esxcli system syslog config set --loghost="tcp://siem.example.com:514"

# 보안 로그 전달 (TLS 암호화 - 권장)
esxcli system syslog config set --loghost="ssl://siem.example.com:1514"

# Syslog 방화벽 규칙 활성화
esxcli network firewall ruleset set --ruleset-id syslog --enabled true

# 설정 적용 및 확인
esxcli system syslog reload
esxcli system syslog config get
```

---

### 5.2 vCenter Syslog 전달 / vCenter Syslog Forwarding

```bash
# VCSA Syslog 전달 설정 (VAMI)
# https://<vcsa>:5480 > Syslog > New Syslog Configuration

# VCSA CLI를 통한 설정
/usr/lib/vmware/vpostgres/current/bin/psql -d VCDB -U vc -c \
  "SELECT * FROM VPX_PARAMETER WHERE NAME = 'log.level';"

# vCenter 이벤트 로그 위치
# /var/log/vmware/vpxd/vpxd.log      — 주요 vCenter 작업 로그
# /var/log/vmware/sso/               — SSO 인증 로그
# /var/log/audit/audit.log           — OS 감사 로그
# /var/log/vmware/vapi/              — vAPI 요청 로그
```

---

### 5.3 감사 로그 대상 이벤트 / Key Audit Events

| 이벤트 / Event | 로그 위치 / Log Location | 비고 |
|----------------|--------------------------|------|
| vCenter 로그인/로그아웃 | vpxd.log | 로그인 실패 포함 |
| VM 전원 조작 | vpxd.log, vmkernel.log | |
| 스냅샷 생성/삭제 | vpxd.log | |
| vMotion 작업 | vpxd.log | |
| 권한 변경 | vpxd.log | 역할/권한 부여 이벤트 |
| ESXi SSH 로그인 | /var/log/auth.log | |
| Lockdown Mode 변경 | hostd.log | |
| 설정 변경 | hostd.log, vpxd.log | |

---

### 5.4 로그 보존 정책 / Log Retention Policy

```bash
# ESXi 로그 로테이션 설정
esxcli system syslog config set --logsize=10240 --rotate=10
# logsize: 각 로그 파일 최대 크기 (KB), rotate: 보존할 로그 파일 수

# 최소 권장 보존 기간
# - 운영 로그: 90일 이상
# - 보안 감사 로그: 1년 이상 (PCI-DSS, HIPAA 요구사항)
# - SIEM으로 전달 시 SIEM 보존 정책 적용
```

---

## 6. 네트워크 보안 / Network Security

### 6.1 관리 네트워크 격리 / Management Network Isolation

관리 네트워크(VMkernel 관리 포트)는 VM 트래픽 및 기타 VMkernel 네트워크(vMotion, vSAN, iSCSI)와 물리적 또는 VLAN으로 격리해야 한다.

```bash
# 현재 VMkernel 인터페이스 및 태그 확인
esxcli network ip interface list
esxcli network ip interface tag get -i vmk0

# VMkernel 태그 설정 (Management)
esxcli network ip interface tag add -i vmk0 -t Management

# 관리 VMkernel에 할당된 포트그룹 확인
esxcli network vswitch standard portgroup list

# 관리 포트그룹 VLAN 확인
esxcli network vswitch standard portgroup policy failover get -p "Management Network"
```

```powershell
# PowerCLI: VMkernel 인터페이스 확인
Get-VMHost "esxi01" | Get-VMHostNetworkAdapter | Where-Object { $_.ManagementTrafficEnabled }
```

---

### 6.2 vMotion 네트워크 암호화 / vMotion Network Encryption

vSphere 6.5 이상에서 vMotion 암호화를 지원한다. 프로덕션 환경에서는 Encrypted vMotion을 활성화해야 한다.

```powershell
# PowerCLI: VM vMotion 암호화 설정
$vm = Get-VM "MyVM"
$spec = New-Object VMware.Vim.VirtualMachineConfigSpec
$spec.MigrateEncryption = "required"   # required, opportunistic, disabled
$vm.ExtensionData.ReconfigVM($spec)

# 클러스터 전체 vMotion 암호화 확인
Get-Cluster "Production" | Get-VM | ForEach-Object {
    $_.ExtensionData.Config.MigrateEncryption
}
```

---

### 6.3 vSwitch 보안 정책 / vSwitch Security Policy

```bash
# 표준 vSwitch 보안 정책 확인 (기본값이 보안적으로 올바른지 검증)
esxcli network vswitch standard policy security get -v vSwitch0

# 권장 보안 정책 설정 (모두 거부)
esxcli network vswitch standard policy security set -v vSwitch0 \
  --allow-forged-transmits false \
  --allow-mac-change false \
  --allow-promiscuous false

# 포트그룹별 보안 정책 설정
esxcli network vswitch standard portgroup policy security set \
  -p "VM Network" \
  --allow-forged-transmits false \
  --allow-mac-change false \
  --allow-promiscuous false
```

```powershell
# PowerCLI: vDS 포트그룹 보안 정책 확인 및 설정
Get-VDSwitch "DSwitch" | Get-VDPortgroup | ForEach-Object {
    $pg = $_
    $policy = $pg | Get-VDSecurityPolicy
    if ($policy.AllowPromiscuous -or $policy.ForgedTransmits -or $policy.MacChanges) {
        Write-Host "Non-compliant: $($pg.Name)"
        $pg | Get-VDSecurityPolicy | Set-VDSecurityPolicy `
          -AllowPromiscuous $false `
          -ForgedTransmits $false `
          -MacChanges $false
    }
}
```

| 보안 정책 / Security Policy | 기본값 | 권장값 | 설명 |
|-----------------------------|--------|--------|------|
| Forged Transmits | Reject | **Reject** | 위조 MAC 송신 차단 |
| MAC Address Changes | Accept | **Reject** | 게스트 MAC 변경 차단 |
| Promiscuous Mode | Reject | **Reject** | 무차별 모드 차단 |

> **STIG**: ESXI-70-000059, 000060, 000061 — vSwitch security policies must block all three.

---

## 7. 주요 과거 보안 취약점 / Critical Historical VMSAs

### 7.1 VMSA-2021-0028 — Log4Shell (CVE-2021-44228)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2021-44228, CVE-2021-45046 |
| CVSS | 10.0 (Critical) |
| 영향 제품 | vCenter Server 7.0, 6.7, 6.5; vRealize 제품군 |
| 취약점 유형 | Log4j JNDI injection → Remote Code Execution |
| 발표일 | 2021-12-10 |

**영향 버전 및 픽스**:
- vCenter 7.0: 7.0 U3c (19480866) 이상으로 업그레이드
- vCenter 6.7: 6.7 U3o (19480866)
- vCenter 6.5: 6.5 U3t

**임시 완화 조치** (패치 전):
```bash
# vCenter 6.5/6.7/7.0 임시 완화 스크립트 (KB 87081)
# Broadcom이 제공한 vc_log4j_mitigator.py 스크립트 실행
python vc_log4j_mitigator.py

# 완화 적용 여부 확인
# /var/log/vmware/appliance-mgmt-log4j-mitigated 파일 존재 여부 확인
ls /var/log/vmware/ | grep mitigated
```

> **Reference**: [VMSA-2021-0028](https://www.vmware.com/security/advisories/VMSA-2021-0028.html), KB 87081

---

### 7.2 VMSA-2022-0011 — Workspace ONE Access RCE (CVE-2022-22954)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2022-22954 (주요), CVE-2022-22955~22960 |
| CVSS | 9.8 (Critical) |
| 영향 제품 | VMware Workspace ONE Access, Identity Manager, vRealize Automation |
| 취약점 유형 | Server-Side Template Injection → RCE (인증 불필요) |
| 발표일 | 2022-04-06 |
| 실제 공격 | 발표 48시간 내 대규모 악용 시작 |

**수정 버전**:
- Workspace ONE Access 21.08.0.1 이상
- Identity Manager 3.3.6 이상
- vRealize Automation 7.6 패치 적용

**완화 조치**:
```bash
# 임시 완화: Workspace ONE Access 관리 콘솔에서
# 외부 인터넷 접근 차단 (Management Interface IP 제한)
# 패치가 불가능한 경우 네트워크 레벨에서 외부 접근 차단
```

> **Reference**: [VMSA-2022-0011](https://www.vmware.com/security/advisories/VMSA-2022-0011.html)

---

### 7.3 VMSA-2023-0023 — vCenter Out-of-Bounds Write (CVE-2023-34048)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2023-34048 |
| CVSS | 9.8 (Critical) |
| 영향 제품 | vCenter Server 7.0, 8.0 |
| 취약점 유형 | DCERPC 프로토콜 out-of-bounds write → Pre-auth RCE |
| 발표일 | 2023-10-25 |
| 실제 공격 | 2023년 말 ~ 2024년 초 APT 그룹에 의해 악용 |

**수정 버전**:
- vCenter 7.0: 7.0 U3o (22357613) 이상
- vCenter 8.0: 8.0 U2 이상

**임시 완화**: 공식 완화 없음 — 즉시 패치 적용 필수.

```bash
# 현재 vCenter 버전 확인
cat /etc/vmware/build

# 패치 적용 전 네트워크 레벨 완화
# vCenter 포트 443, 8443 접근을 관리 IP 대역으로 제한
# vCenter 포트 2012, 2014, 2020 (DCERPC) 방화벽 차단
```

> **Reference**: [VMSA-2023-0023](https://www.vmware.com/security/advisories/VMSA-2023-0023.html)

---

## 8. 보안 점검 체크리스트 / Security Audit Checklist

각 항목 옆의 명령어를 실행하여 준수 여부를 확인한다. 모든 명령은 ESXi SSH 또는 esxcli를 통해 실행한다.

Run the command next to each item to verify compliance. All commands run via ESXi SSH or esxcli.

### ESXi 호스트 점검 / ESXi Host Checks

```bash
#!/bin/bash
# ESXi Security Audit Script
# 실행: ESXi SSH shell에서 실행

ESXI_HOST="esxi01.example.com"
echo "=== ESXi Security Audit: $ESXI_HOST ==="
echo "=== $(date) ==="

echo ""
echo "[1] ESXi Version & Build"
esxcli system version get

echo ""
echo "[2] Lockdown Mode Status"
vim-cmd hostsvc/get_lockdown

echo ""
echo "[3] SSH Service Status (should be stopped/disabled)"
esxcli network firewall ruleset list | grep -i ssh
vim-cmd hostsvc/get_ssh_info 2>/dev/null || echo "SSH service status check"

echo ""
echo "[4] ESXi Shell Timeout Settings"
esxcli system settings advanced list -o /UserVars/ESXiShellInteractiveTimeOut
esxcli system settings advanced list -o /UserVars/ESXiShellTimeOut

echo ""
echo "[5] DCUI Timeout"
esxcli system settings advanced list -o /UserVars/DcuiTimeOut

echo ""
echo "[6] Password Quality Control"
esxcli system settings advanced list -o /Security/PasswordQualityControl

echo ""
echo "[7] Account Lockout Policy"
esxcli system settings advanced list -o /Security/AccountLockFailures
esxcli system settings advanced list -o /Security/AccountUnlockTime

echo ""
echo "[8] MOB Status (should be 0/disabled)"
esxcli system settings advanced list -o /Config/HostAgent/plugins/solo/enableMob

echo ""
echo "[9] SNMP Status (should be disabled unless required)"
esxcli system snmp get | grep -i "enable\|community"

echo ""
echo "[10] Syslog Remote Host"
esxcli system syslog config get | grep -i loghost

echo ""
echo "[11] Firewall Status"
esxcli network firewall get | grep -i "enabled\|default"

echo ""
echo "[12] vSwitch Security Policies (vSwitch0)"
esxcli network vswitch standard policy security get -v vSwitch0

echo ""
echo "[13] TLS Disabled Protocols"
esxcli system settings advanced list -o /UserVars/ESXiVPsDisabledProtocols

echo ""
echo "[14] NTP Configuration"
esxcli system ntp get

echo ""
echo "[15] Accepted Banner (login warning)"
esxcli system settings advanced list -o /Config/Etc/issue

echo "=== Audit Complete ==="
```

### 점검 항목 요약 / Checklist Summary

| # | 항목 / Item | 명령어 / Command | 기대값 / Expected |
|---|-------------|------------------|-------------------|
| 1 | Lockdown Mode | `vim-cmd hostsvc/get_lockdown` | `enabled` |
| 2 | SSH 비활성화 | `esxcli network firewall ruleset list \| grep sshServer` | `false` |
| 3 | Shell Timeout | `esxcli system settings advanced list -o /UserVars/ESXiShellInteractiveTimeOut` | `≤ 900` |
| 4 | 패스워드 복잡도 | `esxcli system settings advanced list -o /Security/PasswordQualityControl` | `min=disabled,disabled,disabled,disabled,15` |
| 5 | 계정 잠금 | `esxcli system settings advanced list -o /Security/AccountLockFailures` | `≤ 5` |
| 6 | MOB 비활성화 | `esxcli system settings advanced list -o /Config/HostAgent/plugins/solo/enableMob` | `0` |
| 7 | Syslog 설정 | `esxcli system syslog config get \| grep loghost` | 원격 서버 주소 존재 |
| 8 | Forged Transmits | `esxcli network vswitch standard policy security get -v vSwitch0` | `false` |
| 9 | MAC Changes | `esxcli network vswitch standard policy security get -v vSwitch0` | `false` |
| 10 | Promiscuous | `esxcli network vswitch standard policy security get -v vSwitch0` | `false` |
| 11 | TLS 버전 | `esxcli system settings advanced list -o /UserVars/ESXiVPsDisabledProtocols` | `sslv3,tlsv1,tlsv1.1` |
| 12 | SNMP 비활성화 | `esxcli system snmp get` | `Enabled: false` |
| 13 | NTP 동기화 | `esxcli system ntp get` | NTP 서버 구성됨 |
| 14 | 방화벽 활성화 | `esxcli network firewall get` | `Enabled: true` |
| 15 | 패스워드 만료 | `esxcli system settings advanced list -o /Security/PasswordMaxDays` | `≤ 90` |

### vCenter 점검 / vCenter Checks

```bash
# VCSA SSH에서 실행

echo "[vCenter Audit]"

echo ""
echo "[1] vCenter Version"
cat /etc/vmware/build

echo ""
echo "[2] root Password Expiry"
chage -l root

echo ""
echo "[3] Services Status"
service-control --status --all 2>/dev/null | grep -E "STOPPED|RUNNING" | head -20

echo ""
echo "[4] TLS Configuration"
/usr/lib/vmware-TlsReconfigurator/VcTlsReconfigurator/reconfigureVc query 2>/dev/null

echo ""
echo "[5] Listening Ports"
netstat -tlnp 2>/dev/null | grep -E ":443|:80|:5480|:22"

echo ""
echo "[6] SSH Status (should be disabled)"
systemctl status sshd | grep -E "Active|enabled"

echo ""
echo "[7] Firewall Status"
iptables -L INPUT --line-numbers | head -20
```

---

## 9. 참고 자료 / References

| 문서 / Document | URL | 설명 |
|-----------------|-----|------|
| VMware vSphere 7.0 Security Configuration Guide | https://core.vmware.com/security-configuration-guide | VMware 공식 SCG |
| DISA STIG for VMware vSphere 7.0 ESXi | https://public.cyber.mil/stigs/downloads/ | 미국방부 보안 기준 |
| CIS VMware ESXi 7 Benchmark | https://www.cisecurity.org/benchmark/vmware | CIS 벤치마크 |
| NIST SP 800-125B | https://csrc.nist.gov/publications/detail/sp/800-125b/final | 가상화 네트워크 보안 |
| VMware Security Advisories | https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories | 보안 권고문 |
| VMSA-2024-0013 (CVE-2024-37085) | https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/24505 | AD 인증 우회 |
| VMSA-2023-0023 (CVE-2023-34048) | https://www.vmware.com/security/advisories/VMSA-2023-0023.html | vCenter RCE |
| VMSA-2021-0028 (Log4Shell) | https://www.vmware.com/security/advisories/VMSA-2021-0028.html | Log4j RCE |
| KB 87081 — Log4j Mitigation | https://knowledge.broadcom.com/external/article/315688 | Log4Shell 완화 조치 |
| KB 88282 — VCSA Password Expiry | https://knowledge.broadcom.com/external/article/319269 | VCSA root 패스워드 만료 |
| KB 2148819 — Disable TLS 1.0/1.1 | https://knowledge.broadcom.com/external/article/316621 | TLS 구성 |
| VCF Security & Compliance Guidelines (GitHub) | https://github.com/vmware/vcf-security-and-compliance-guidelines | VMware 공식 보안 강화 스크립트 및 가이드 |
| ESXiArgs Ransomware Resources | https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/ransomware-resources | ESXi 랜섬웨어 대응 자료 |

---

## 10. ESXi 랜섬웨어 대응 / ESXi Ransomware Response

> Source: VMware VCF Security & Compliance Guidelines — Ransomware Resources
> https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/ransomware-resources

### 10.1 ESXiArgs 공격 개요 / ESXiArgs Attack Overview

2023년 2월에 대규모로 확산된 ESXiArgs 랜섬웨어는 CVE-2021-21974(ESXi OpenSLP 힙 오버플로우) 취약점을 악용하여 인터넷에 노출된 ESXi 호스트를 자동으로 감염시켰다. 패치 미적용 및 SLP 서비스가 인터넷에 직접 노출된 환경이 주요 표적이었다.

The ESXiArgs ransomware campaign (February 2023) exploited CVE-2021-21974, a heap-overflow vulnerability in the ESXi OpenSLP service (port 427), to mass-compromise internet-exposed ESXi hosts that had not applied patches available since 2021.

| 항목 / Item | 내용 / Details |
|-------------|----------------|
| 취약점 / CVE | CVE-2021-21974 (ESXi OpenSLP Heap Overflow) |
| CVSS | 8.8 (High) |
| 영향 버전 | ESXi 7.x < ESXi70U1c-17325551, ESXi 6.7.x < ESXi670-202102401-SG, ESXi 6.5.x < ESXi650-202102101-SG |
| 공격 벡터 | 네트워크 (포트 427/TCP, UDP — SLP 서비스) |
| 인증 요구 | 없음 (Unauthenticated RCE) |
| 발표일 | 2021-02-23 (패치), 2023-02-03 (대규모 캠페인) |
| 관련 그룹 / Groups | Nevada 랜섚웨어, ESXiArgs (독립 캠페인) |

**랜섬웨어 암호화 대상 파일 확장자 / Targeted File Extensions**:
`.vmdk`, `.vmx`, `.vmxf`, `.vmsd`, `.vmsn`, `.vswp`, `.vmss`, `.nvram`, `.vmem`

**암호화 방식**: 각 VM의 flat VMDK 파일 중 1MB 단위 청크를 부분적으로 암호화 (초기 버전). 후속 버전(ESXiArgs v2)은 암호화 비율을 높여 복구 난이도를 증가시켰다.

---

### 10.2 침해 지표 / Indicators of Compromise (IoC)

**ESXi 호스트 침해 징후**:

```bash
# 랜섬노트 파일 존재 확인
find /vmfs/volumes/ -name "ransom.html" -o -name "How_to_Restore_Your_Files.html" 2>/dev/null
find /tmp -name "*.py" -o -name "encrypt" 2>/dev/null

# 암호화된 VM 설정 파일 확인 (.args 확장자 추가됨)
find /vmfs/volumes/ -name "*.args" 2>/dev/null

# 비정상적인 프로세스 확인 (암호화 중인 경우)
esxcli system process list | grep -v -E "vmx|vmkctl|hostd|vpxa|rhttpproxy"

# SLP 서비스 상태 및 포트 427 오픈 확인
esxcli system process list | grep slpd
netstat -an | grep :427

# Python 스크립트 실행 흔적 (공격자 도구)
find /tmp /store -name "*.py" 2>/dev/null
find /vmfs/volumes/ -name "encrypt" -type f 2>/dev/null

# 수상한 cron 작업 확인
cat /var/spool/cron/crontabs/root 2>/dev/null

# 최근 인증 로그 이상 확인
cat /var/log/auth.log | grep -E "Failed|Accepted|session opened" | tail -50

# vmx 파일 중 .args 파일이 함께 존재하는 VM 목록 (암호화된 VM)
for vol in /vmfs/volumes/*/; do
  find "$vol" -name "*.vmx" | while read vmx; do
    if [ -f "${vmx}.args" ]; then
      echo "ENCRYPTED VM: $vmx"
    fi
  done
done
```

**네트워크 레벨 IoC**:
- 외부에서 포트 427(TCP/UDP)로의 연결 시도
- ESXi 관리 인터페이스(포트 443, 902)에 대한 비정상 접근
- VMFS 볼륨에 대한 대용량 쓰기 I/O 급증 (암호화 진행 중)

---

### 10.3 즉각 대응 절차 / Immediate Response Steps

**[단계 1] 격리 / Isolate**

```bash
# 1. 물리적 또는 vSwitch 레벨에서 관리 네트워크 격리
# vSphere Client에서 호스트의 관리 vmkernel 포트그룹을 격리 VLAN으로 이동
# 또는 물리 스위치에서 해당 포트 차단

# 2. 인터넷 노출 즉시 차단 — 방화벽에서 포트 427, 443, 902 차단
# (이미 감염된 경우) 추가 확산 방지를 위해 호스트 네트워크 케이블 제거 검토

# 3. SLP 서비스 즉시 비활성화 (감염되지 않은 인접 호스트에서도 선제 조치)
/etc/init.d/slpd stop
esxcli system settings advanced set -o /Net/SLPMaxMessageSize -i 0
chkconfig slpd off
```

**[단계 2] 증거 보존 / Preserve Evidence**

```bash
# 침해 호스트의 메모리 및 프로세스 스냅샷 수집
esxcli system process list > /tmp/process_list_$(date +%Y%m%d_%H%M%S).txt

# 실행 중인 VM 목록 및 상태 수집
esxcli vm process list > /tmp/vm_list_$(date +%Y%m%d_%H%M%S).txt

# 네트워크 연결 상태 수집
esxcli network ip connection list > /tmp/netconn_$(date +%Y%m%d_%H%M%S).txt

# 로그 파일 백업 (외부 안전 저장소로 복사)
# /var/log/auth.log, /var/log/hostd.log, /var/log/vmkernel.log, /var/log/shell.log
cp /var/log/auth.log /vmfs/volumes/<safe-datastore>/forensics/
cp /var/log/shell.log /vmfs/volumes/<safe-datastore>/forensics/

# 랜섬노트 및 암호화 도구 바이너리 해시 기록
md5sum /tmp/encrypt 2>/dev/null
sha256sum /vmfs/volumes/*/ransom.html 2>/dev/null
```

**[단계 3] 영향 범위 확인 / Assess Scope**

```bash
# 암호화된 VM 목록 전체 수집
find /vmfs/volumes/ -name "*.vmx.args" -o -name "*.vmdk.args" 2>/dev/null | tee /tmp/encrypted_vms.txt

# 암호화되지 않은 VM 확인 (복구 우선순위 결정)
find /vmfs/volumes/ -name "*.vmx" | while read vmx; do
  if [ ! -f "${vmx}.args" ]; then
    echo "INTACT: $vmx"
  fi
done

# 데이터스토어별 암호화 현황
for ds in /vmfs/volumes/*/; do
  total=$(find "$ds" -name "*.vmdk" 2>/dev/null | wc -l)
  encrypted=$(find "$ds" -name "*.vmdk.args" 2>/dev/null | wc -l)
  echo "Datastore: $ds | Total VMDKs: $total | Encrypted: $encrypted"
done
```

---

### 10.4 복구 절차 / Recovery Procedures

**ESXiArgs 초기 버전(v1) — 부분 암호화 복구 가능**:

초기 ESXiArgs는 VMDK flat 파일의 일정 크기 이하 청크만 암호화했기 때문에, CISA와 VMware가 제공한 스크립트로 VM 설정을 재구성하여 복구가 가능한 경우가 있었다.

```bash
# CISA ESXiArgs 복구 스크립트 참조
# https://github.com/cisagov/ESXiArgs-Recover
# (인터넷 연결 가능한 격리된 시스템에서 다운로드 후 ESXi에 전송)

# 복구 전 확인: flat VMDK 파일이 손상되지 않은 경우
# 암호화된 .vmdk 파일과 별개로 -flat.vmdk 파일 상태 확인
ls -la /vmfs/volumes/<datastore>/<vm-folder>/
# <vm>-flat.vmdk 파일이 존재하고 크기가 정상이면 복구 시도 가능

# 새 VMX 파일 재구성 (암호화된 .vmx를 대체)
# vmx 파일의 .args 내용을 참고하여 VM 설정 재작성
# 이후 vSphere Client에서 "Register VM" 으로 재등록
```

**ESXiArgs v2 이후 — 전체 암호화 시 복구 절차**:

v2 이후 버전은 VMDK 전체를 암호화하여 스크립트 기반 복구가 불가능하다. 다음 절차를 따른다:

```
1. 백업에서 복구 (최우선)
   - vSphere 파일 기반 백업 (Veeam, Commvault, Veritas 등)
   - VCSA 파일 기반 백업 (VAMI)
   - VM 스냅샷 (외부 백업 스토리지에 보관된 경우)

2. ESXi 호스트 재구성
   a. ESXi ISO로 클린 재설치 (기존 설정 완전 제거)
   b. 패치된 버전으로 설치: ESXi 7.0 U3r 이상 (Build 24411414)
   c. 호스트 재구성 (백업에서 복원 또는 재구성)
   d. 검증된 백업에서 VM 복원

3. vCenter 재구성 (vCenter도 영향받은 경우)
   a. VCSA 파일 기반 백업에서 복원
   b. 또는 VCSA 재배포 후 DB 복원
```

---

### 10.5 ESXi 랜섬웨어 예방 조치 / Prevention Measures

**즉시 적용해야 할 필수 조치**:

```bash
# [1] SLP 서비스 영구 비활성화 (CVE-2021-21974 완화)
/etc/init.d/slpd stop
chkconfig slpd off
# 확인
chkconfig --list | grep slpd   # 모든 런레벨에서 off

# [2] 포트 427 방화벽 차단
esxcli network firewall ruleset set --ruleset-id CIMHttpServer --enabled false
esxcli network firewall ruleset set --ruleset-id CIMHttpsServer --enabled false
# SLP는 별도 방화벽 규칙이 없으므로 서비스 비활성화가 주요 완화책

# [3] 패치 적용 확인 (CVE-2021-21974 수정 버전)
esxcli system version get
# ESXi 7.0: ESXi70U1c-17325551 이상 필요
# ESXi 6.7: ESXi670-202102401-SG 이상
# ESXi 6.5: ESXi650-202102101-SG 이상

# [4] ESXi 관리 포트 접근 제한 (포트 443, 902)
esxcli network firewall ruleset set --ruleset-id webAccess --allowed-all false
esxcli network firewall ruleset allowedip add --ruleset-id webAccess --ip-address <mgmt-subnet>/24

# [5] Lockdown Mode 활성화 (직접 관리 접근 차단)
vim-cmd hostsvc/enable_normal_lockdown

# [6] SSH 비활성화
vim-cmd hostsvc/stop_ssh
vim-cmd hostsvc/disable_ssh
```

**아키텍처 수준 예방 조치**:

| 조치 / Measure | 설명 / Description | 우선순위 |
|----------------|---------------------|----------|
| 관리 네트워크 격리 | ESXi 관리 인터페이스를 전용 관리 VLAN에 배치, 인터넷 직접 노출 금지 | Critical |
| SLP 서비스 비활성화 | CVE-2021-21974 및 유사 취약점 완화. 불필요한 검색 서비스 제거 | Critical |
| 정기 패치 적용 | ESXi 패치를 분기별 이상 적용. 보안 패치는 발표 후 7일 이내 | Critical |
| MFA 강제 | vCenter 및 ESXi 관리 접근에 다단계 인증 적용 | High |
| 불변 백업 | 3-2-1-1 규칙: 3개 사본, 2개 미디어, 1개 오프사이트, 1개 오프라인/불변 | High |
| 네트워크 마이크로 세그멘테이션 | VM 간 및 관리 트래픽 NSX 방화벽으로 제어 | High |
| Syslog 전달 | 침해 후 로그 보존을 위해 외부 SIEM으로 즉시 전달 | High |
| vCenter 권한 최소화 | 관리자 역할 최소 부여, 서비스 계정 전용 사용 | Medium |

---

### 10.6 ESXi를 표적으로 하는 주요 랜섬웨어 그룹 / Known Ransomware Groups Targeting ESXi

| 그룹 / Group | 주요 기법 / Key Techniques | 관련 VMSA/CVE | 최초 확인 |
|--------------|---------------------------|---------------|-----------|
| **ESXiArgs** | CVE-2021-21974 SLP 취약점 자동 익스플로잇 | CVE-2021-21974 | 2023-02 |
| **Nevada** | 동일 SLP 취약점, Rust 기반 암호화 | CVE-2021-21974 | 2023-02 |
| **Akira** | AD 접근 후 CVE-2024-37085 악용, ESXi 자격증명 덤프 | VMSA-2024-0013 | 2023-04 |
| **Black Basta** | AD "ESX Admins" 그룹 생성, ESXi 직접 암호화 | VMSA-2024-0013 | 2022-04 |
| **Storm-0506** | Black Basta 협력사, CVE-2024-37085 활용 | VMSA-2024-0013 | 2024 |
| **Royal / BlackSuit** | ESXi 하이퍼바이저 직접 공격, VM 대량 종료 | 다수 | 2022-09 |
| **LockBit 3.0** | ESXi-specific 빌드 존재, vSAN 포함 암호화 | 다수 | 2022 |
| **Conti** | ESXi 관리 자격증명 탈취 후 수동 배포 | 다수 | 2020 |
| **AlphV/BlackCat** | Rust 기반 ESXi 리눅스 암호화 모듈 | 다수 | 2021-11 |

**공통 공격 패턴**:
1. 초기 침투 (Initial Access): 인터넷 노출 서비스 취약점 또는 피싱을 통한 AD 자격증명 탈취
2. 횡이동 (Lateral Movement): vCenter 접근 → 관리 권한 획득
3. 영향 (Impact): VM 종료 → VMDK/VMX 파일 암호화 → 랜섬노트 생성

---

## 11. vSphere SCG 주요 컨트롤 / vSphere Security Configuration Guide Key Controls

> Source: VMware vSphere 7.0 Security Configuration Guide
> https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/security-configuration-hardening-guide/vsphere/7.0
> https://core.vmware.com/security-configuration-guide

VMware SCG(Security Configuration Guide)는 vSphere 환경에 대한 공식 보안 기준선을 제공한다. 각 컨트롤은 심각도(Severity)와 함께 검증 및 적용 명령을 포함한다.

The VMware Security Configuration Guide (SCG) provides the official security baseline for vSphere. Controls are organized by component and include verification and enforcement commands.

### 11.1 ESXi 호스트 컨트롤 / ESXi Host Controls

| 컨트롤 ID | 제목 / Title | 심각도 | 검증 명령 / Verify Command | 적용 명령 / Enforce Command |
|-----------|-------------|--------|---------------------------|----------------------------|
| ESXi-70-000001 | Lockdown Mode 활성화 | Critical | `vim-cmd hostsvc/get_lockdown` | `vim-cmd hostsvc/enable_normal_lockdown` |
| ESXi-70-000002 | SSH 비활성화 | High | `esxcli network firewall ruleset list \| grep sshServer` | `vim-cmd hostsvc/stop_ssh && vim-cmd hostsvc/disable_ssh` |
| ESXi-70-000003 | ESXi Shell 비활성화 | High | `vim-cmd hostsvc/get_ssh_info` | `vim-cmd hostsvc/stop_esx_shell && vim-cmd hostsvc/disable_esx_shell` |
| ESXi-70-000004 | 원격 Syslog 설정 | High | `esxcli system syslog config get \| grep loghost` | `esxcli system syslog config set --loghost="tcp://<siem>:514"` |
| ESXi-70-000005 | 계정 잠금 임계값 ≤ 5 | High | `esxcli system settings advanced list -o /Security/AccountLockFailures` | `esxcli system settings advanced set -o /Security/AccountLockFailures -i 3` |
| ESXi-70-000006 | 계정 잠금 해제 시간 ≥ 900초 | Medium | `esxcli system settings advanced list -o /Security/AccountUnlockTime` | `esxcli system settings advanced set -o /Security/AccountUnlockTime -i 900` |
| ESXi-70-000007 | 로그인 배너 설정 | Medium | `esxcli system settings advanced list -o /Config/Etc/issue` | `esxcli system settings advanced set -o /Config/Etc/issue -s "Authorized use only."` |
| ESXi-70-000008 | SLP 서비스 비활성화 | Critical | `chkconfig --list \| grep slpd` | `/etc/init.d/slpd stop && chkconfig slpd off` |
| ESXi-70-000010 | NTP 동기화 설정 | Medium | `esxcli system ntp get` | `esxcli system ntp set --enabled true --server <ntp-server>` |
| ESXi-70-000012 | ESXi Shell 인터랙티브 타임아웃 | Medium | `esxcli system settings advanced list -o /UserVars/ESXiShellInteractiveTimeOut` | `esxcli system settings advanced set -o /UserVars/ESXiShellInteractiveTimeOut -i 900` |
| ESXi-70-000013 | ESXi Shell 데몬 타임아웃 | Medium | `esxcli system settings advanced list -o /UserVars/ESXiShellTimeOut` | `esxcli system settings advanced set -o /UserVars/ESXiShellTimeOut -i 600` |
| ESXi-70-000014 | DCUI 타임아웃 | Medium | `esxcli system settings advanced list -o /UserVars/DcuiTimeOut` | `esxcli system settings advanced set -o /UserVars/DcuiTimeOut -i 600` |
| ESXi-70-000015 | MOB 비활성화 | High | `esxcli system settings advanced list -o /Config/HostAgent/plugins/solo/enableMob` | `esxcli system settings advanced set -o /Config/HostAgent/plugins/solo/enableMob -i 0` |
| ESXi-70-000020 | TLS 1.0/1.1 비활성화 | High | `esxcli system settings advanced list -o /UserVars/ESXiVPsDisabledProtocols` | `esxcli system settings advanced set -o /UserVars/ESXiVPsDisabledProtocols -s "sslv3,tlsv1,tlsv1.1"` |
| ESXi-70-000025 | 패스워드 복잡도 정책 | High | `esxcli system settings advanced list -o /Security/PasswordQualityControl` | `esxcli system settings advanced set -o /Security/PasswordQualityControl -s "min=disabled,disabled,disabled,disabled,15"` |
| ESXi-70-000026 | 패스워드 최대 사용 기간 | Medium | `esxcli system settings advanced list -o /Security/PasswordMaxDays` | `esxcli system settings advanced set -o /Security/PasswordMaxDays -i 90` |
| ESXi-70-000030 | SNMP 비활성화 또는 v3 전용 | Medium | `esxcli system snmp get \| grep -i enable` | `esxcli system snmp set --enable false` |
| ESXi-70-000035 | 방화벽 활성화 | Critical | `esxcli network firewall get \| grep Enabled` | `esxcli network firewall set --enabled true` |
| ESXi-70-000040 | 허용 IP 기반 SSH 접근 제한 | High | `esxcli network firewall ruleset allowedip list --ruleset-id sshServer` | `esxcli network firewall ruleset set --ruleset-id sshServer --allowed-all false` |
| ESXi-70-000045 | 영구 로그 저장소 설정 | High | `esxcli system syslog config get \| grep logdir` | `esxcli system syslog config set --logdir="/vmfs/volumes/<ds>/logs"` |
| ESXi-70-000050 | Forged Transmits 차단 | High | `esxcli network vswitch standard policy security get -v vSwitch0` | `esxcli network vswitch standard policy security set -v vSwitch0 --allow-forged-transmits false` |
| ESXi-70-000051 | MAC Address Changes 차단 | High | `esxcli network vswitch standard policy security get -v vSwitch0` | `esxcli network vswitch standard policy security set -v vSwitch0 --allow-mac-change false` |
| ESXi-70-000052 | Promiscuous Mode 차단 | High | `esxcli network vswitch standard policy security get -v vSwitch0` | `esxcli network vswitch standard policy security set -v vSwitch0 --allow-promiscuous false` |
| ESXi-70-000055 | iSCSI CHAP 인증 | Medium | `esxcli iscsi adapter auth chap get` | vSphere Client에서 iSCSI 어댑터 속성 > CHAP 설정 |
| ESXi-70-000058 | BPDU 필터 활성화 | Medium | `esxcli network vswitch standard policy security get -v vSwitch0` | vDS BPDU Filter 활성화 (vSphere Client) |

### 11.2 vCenter 컨트롤 / vCenter Controls

| 컨트롤 ID | 제목 / Title | 심각도 | 검증 방법 / Verify | 적용 방법 / Enforce |
|-----------|-------------|--------|-------------------|---------------------|
| VCSA-70-000001 | vCenter 최신 패치 적용 | Critical | `cat /etc/vmware/build` | vLCM 또는 ISO 업그레이드 |
| VCSA-70-000002 | SSO 로그인 배너 설정 | Medium | vSphere Client > Administration > SSO > Configuration | SSO 구성 화면에서 배너 설정 |
| VCSA-70-000003 | SSO 세션 타임아웃 | Medium | Administration > Client Configuration | 권장값: 30분 이하 |
| VCSA-70-000005 | SSO 계정 잠금 정책 | High | `Get-SsoLockoutPolicy` | `Set-SsoLockoutPolicy -MaxFailedAttempts 3` |
| VCSA-70-000006 | SSO 패스워드 복잡도 | High | `Get-SsoPasswordPolicy` | `Set-SsoPasswordPolicy` (최소 15자 권장) |
| VCSA-70-000008 | TLS 1.0/1.1 비활성화 | High | `/usr/lib/vmware-TlsReconfigurator/VcTlsReconfigurator/reconfigureVc query` | `reconfigureVc reconfigure --tls TLS_1.2` |
| VCSA-70-000010 | root 패스워드 만료 관리 | High | `chage -l root` | `chage -M 90 root` |
| VCSA-70-000012 | VCSA bash 접근 제한 | High | `getent passwd root \| cut -d: -f7` | `chsh -s /bin/appliancesh root` |
| VCSA-70-000015 | Syslog 원격 전달 | High | VAMI (포트 5480) > Syslog | VAMI에서 외부 syslog 서버 구성 |
| VCSA-70-000020 | 미사용 플러그인 비활성화 | Medium | Administration > Solutions > Client Plugins | 사용하지 않는 플러그인 비활성화 |
| VCSA-70-000022 | SMTP 알람 설정 | Low | vSphere Client > vCenter > Configure > Advanced Settings | 보안 이벤트 이메일 알람 설정 |
| VCSA-70-000025 | 역할 최소 권한 원칙 | High | Administration > Access Control > Roles | 전역 관리자 역할 최소 부여 |
| VCSA-70-000030 | NTP 동기화 | Medium | VAMI > Time | 2개 이상 NTP 서버 구성 |
| VCSA-70-000035 | vCenter 방화벽 규칙 | High | `iptables -L INPUT` | VAMI > Firewall 또는 perimeter 방화벽 |
| VCSA-70-000040 | 데이터베이스 백업 | High | VAMI > Backup | 정기 VCSA 파일 기반 백업 구성 |
| VCSA-70-000045 | 감사 로그 활성화 | High | `/var/log/audit/audit.log` | auditd 서비스 활성화 확인 |
| VCSA-70-000050 | API 접근 제한 | Medium | vCenter API 접근 IP 제한 | Perimeter 방화벽에서 포트 443 소스 IP 제한 |

### 11.3 VM 컨트롤 / Virtual Machine Controls

| 컨트롤 ID | 제목 / Title | 심각도 | 검증 PowerCLI | 적용 방법 |
|-----------|-------------|--------|--------------|----------|
| VM-70-000001 | VMware Tools 최신 버전 유지 | High | `Get-VM \| Get-View \| Select Name, @{N='ToolsVersion';E={$_.Guest.ToolsVersion}}` | VMware Tools 업데이트 정책 구성 |
| VM-70-000002 | VM 콘솔 접근 제한 | Medium | `Get-VM \| Get-AdvancedSetting -Name "RemoteDisplay.maxConnections"` | `Get-VM "MyVM" \| New-AdvancedSetting -Name "RemoteDisplay.maxConnections" -Value 1` |
| VM-70-000003 | Floppy 드라이브 제거 | Low | `Get-VM \| Get-FloppyDrive` | `Get-VM "MyVM" \| Get-FloppyDrive \| Remove-FloppyDrive -Confirm:$false` |
| VM-70-000004 | CD/DVD 드라이브 연결 해제 | Low | `Get-VM \| Get-CDDrive \| Where-Object {$_.ExtensionData.Connectable.Connected}` | vSphere Client에서 CD/DVD 미디어 연결 해제 |
| VM-70-000005 | 직렬/병렬 포트 제거 | Low | `Get-VM \| Get-View \| Where-Object {$_.Config.Hardware.Device.GetType().Name -eq "VirtualSerialPort"}` | vSphere Client에서 시리얼/패러렐 포트 제거 |
| VM-70-000006 | vMotion 암호화 활성화 | High | `Get-VM \| ForEach-Object {$_.ExtensionData.Config.MigrateEncryption}` | `$spec.MigrateEncryption = "required"` (PowerCLI) |
| VM-70-000007 | 독립 비영구 디스크 제한 | Medium | `Get-VM \| Get-HardDisk \| Where-Object {$_.StorageFormat -eq "Thin"` | 독립 비영구 모드 VMDK 미사용 확인 |
| VM-70-000008 | VM 로그 크기 제한 | Low | `Get-VM \| Get-AdvancedSetting -Name "log.rotateSize"` | `New-AdvancedSetting -Name "log.rotateSize" -Value "1024000"` |
| VM-70-000009 | VM 로그 파일 수 제한 | Low | `Get-VM \| Get-AdvancedSetting -Name "log.keepOld"` | `New-AdvancedSetting -Name "log.keepOld" -Value "10"` |
| VM-70-000010 | 불필요한 VM 기능 비활성화 | Medium | `Get-VM \| Get-AdvancedSetting -Name "isolation.tools.copy.disable"` | `New-AdvancedSetting -Name "isolation.tools.copy.disable" -Value $true` |
| VM-70-000011 | Guest OS 자동 설치 방지 | Medium | `Get-VM \| Get-AdvancedSetting -Name "isolation.tools.diskWiper.disable"` | `New-AdvancedSetting -Name "isolation.tools.diskWiper.disable" -Value $true` |
| VM-70-000012 | VMCI 통신 제한 | Medium | `Get-VM \| Get-AdvancedSetting -Name "vmci0.unrestricted"` | `New-AdvancedSetting -Name "vmci0.unrestricted" -Value $false` |

### 11.4 SCG 일괄 적용 PowerCLI 스크립트 / Bulk SCG Enforcement Script

```powershell
# vSphere 7.0 SCG 핵심 VM 설정 일괄 적용 스크립트
# 실행 전 반드시 테스트 환경에서 검증할 것

Connect-VIServer -Server vcenter.example.com -Credential (Get-Credential)

$vms = Get-VM

foreach ($vm in $vms) {
    Write-Host "Applying SCG settings to: $($vm.Name)"

    # VM-70-000008: 로그 크기 제한 (1MB)
    $vm | New-AdvancedSetting -Name "log.rotateSize" -Value "1024000" -Confirm:$false -Force

    # VM-70-000009: 로그 파일 수 제한
    $vm | New-AdvancedSetting -Name "log.keepOld" -Value "10" -Confirm:$false -Force

    # VM-70-000010: 격리 기능 비활성화
    $vm | New-AdvancedSetting -Name "isolation.tools.copy.disable" -Value $true -Confirm:$false -Force
    $vm | New-AdvancedSetting -Name "isolation.tools.paste.disable" -Value $true -Confirm:$false -Force
    $vm | New-AdvancedSetting -Name "isolation.tools.diskShrink.disable" -Value $true -Confirm:$false -Force
    $vm | New-AdvancedSetting -Name "isolation.tools.diskWiper.disable" -Value $true -Confirm:$false -Force

    # VM-70-000002: 동시 콘솔 연결 제한
    $vm | New-AdvancedSetting -Name "RemoteDisplay.maxConnections" -Value 1 -Confirm:$false -Force
}

Write-Host "SCG VM settings applied to $($vms.Count) VMs."
```

---

## 12. VMSA 상세 Remediation 워크플로우 / VMSA Detailed Remediation Workflows

> Source: VMware VCF Security & Compliance Guidelines — Security Advisories
> https://github.com/vmware/vcf-security-and-compliance-guidelines/tree/main/security-advisories

이 섹션은 기존 `security-advisories.md`에 수록되지 않은 VMSAs에 대한 상세 remediation 워크플로우를 제공한다.

This section provides detailed remediation workflows for VMSAs not already covered in `security-advisories.md`.

---

### 12.1 VMSA-2021-0002 — ESXi OpenSLP RCE (CVE-2021-21974)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2021-21974 |
| CVSS | 8.8 (High) |
| 영향 제품 | ESXi 7.0 < U1c, ESXi 6.7.x, 6.5.x |
| 취약점 유형 | OpenSLP 힙 오버플로우 → 인증 없는 RCE (포트 427) |
| 발표일 | 2021-02-23 |
| 악용 여부 | YES — ESXiArgs 캠페인(2023-02), Nevada 랜섚웨어 |

**Remediation 워크플로우**:

```bash
# [Step 1] 현재 ESXi 버전 및 SLP 서비스 상태 확인
esxcli system version get
chkconfig --list | grep slpd

# [Step 2] 즉시 완화 — SLP 서비스 비활성화 (패치 전 즉시 적용)
/etc/init.d/slpd stop
chkconfig slpd off
# 재부팅 후에도 비활성화 상태 유지 확인
chkconfig --list | grep slpd   # 모든 레벨에서 "off" 확인

# [Step 3] ESXi 패치 계획 수립
# 수정 버전:
# - ESXi 7.0: ESXi70U1c-17325551 이상
# - ESXi 6.7: ESXi670-202102401-SG 이상
# - ESXi 6.5: ESXi650-202102101-SG 이상

# [Step 4] 패치 적용 (vLCM 또는 CLI)
# 방법 A: vSphere Lifecycle Manager (권장)
# Lifecycle Manager > Baselines > Attach & Remediate

# 방법 B: esxcli offline bundle
esxcli software vib install -d /vmfs/volumes/<ds>/ESXi70U1c-17325551.zip

# [Step 5] 패치 적용 후 검증
esxcli system version get
# Version: VMware ESXi 7.0.1, Build: 17325551 이상이어야 함

# [Step 6] SLP 비활성화 상태 재확인
chkconfig --list | grep slpd
```

**사후 모니터링**:
```bash
# 포트 427에 대한 연결 시도 모니터링
esxcli network ip connection list | grep :427
# 비정상 연결이 있는 경우 즉시 네트워크 격리
```

> **Reference**: [VMSA-2021-0002](https://www.vmware.com/security/advisories/VMSA-2021-0002.html)

---

### 12.2 VMSA-2021-0010 — vCenter Server RCE (CVE-2021-21985, CVE-2021-21986)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2021-21985 (CVSS 9.8), CVE-2021-21986 (CVSS 6.5) |
| CVSS | 9.8 (Critical) |
| 영향 제품 | vCenter Server 7.0, 6.7, 6.5 |
| 취약점 유형 | vSAN Health Check 플러그인 RCE (인증 불필요) |
| 발표일 | 2021-05-25 |
| 악용 여부 | YES — 발표 직후 대규모 스캔 및 익스플로잇 |

**Remediation 워크플로우**:

```bash
# [Step 1] 현재 vCenter 버전 확인
cat /etc/vmware/build

# [Step 2] 즉시 완화 — vSAN Health Check 플러그인 비활성화
# vSphere Client: Administration > Solutions > Client Plugins
# vSAN Health Check 플러그인 비활성화

# VAMI API를 통한 플러그인 비활성화 대안 없음 — UI에서만 가능
# 또는 네트워크 레벨에서 포트 443 외부 접근 즉시 차단

# [Step 3] 패치 적용
# 수정 버전:
# - vCenter 7.0: 7.0 U2b (17958471) 이상
# - vCenter 6.7: 6.7 U3n (17994927) 이상
# - vCenter 6.5: 6.5 U3p 이상

# [Step 4] 패치 후 vSAN Health Check 플러그인 재활성화 (필요한 경우)
# vSphere Client > Administration > Solutions > Client Plugins > Enable
```

> **Reference**: [VMSA-2021-0010](https://www.vmware.com/security/advisories/VMSA-2021-0010.html)

---

### 12.3 VMSA-2021-0020 — vCenter Server 파일 업로드 RCE (CVE-2021-22005)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2021-22005 |
| CVSS | 9.8 (Critical) |
| 영향 제품 | vCenter Server 7.0, 6.7 |
| 취약점 유형 | Analytics 서비스 파일 업로드 → RCE (인증 불필요) |
| 발표일 | 2021-09-21 |
| 악용 여부 | YES — 발표 24시간 내 대규모 악용 시작 |

**Remediation 워크플로우**:

```bash
# [Step 1] 현재 버전 확인
cat /etc/vmware/build

# [Step 2] 즉시 완화 스크립트 실행 (VMware 제공 KB 85717)
# VCSA SSH에서 실행:
python /usr/lib/vmware-analytics/scripts/CVE-2021-22005-WORKAROUND.py --enable
# 완화 적용 확인:
python /usr/lib/vmware-analytics/scripts/CVE-2021-22005-WORKAROUND.py --status

# [Step 3] 완화 적용 후에도 즉시 패치 계획 수립
# 수정 버전:
# - vCenter 7.0: 7.0 U3a (18356165) 이상
# - vCenter 6.7: 6.7 U3o (18485166) 이상

# [Step 4] 패치 적용
# VAMI (https://<vcsa>:5480) > Update > Check Updates > Install

# [Step 5] 패치 완료 후 완화 스크립트 롤백 (필요 시)
python /usr/lib/vmware-analytics/scripts/CVE-2021-22005-WORKAROUND.py --disable

# [Step 6] 침해 여부 확인 (사후)
# Analytics 서비스 로그에서 비정상 업로드 확인
grep -i "upload\|PUT\|POST" /var/log/vmware/analytics/*.log | grep -v "200 OK"
```

> **Reference**: [VMSA-2021-0020](https://www.vmware.com/security/advisories/VMSA-2021-0020.html), KB 85717

---

### 12.4 VMSA-2022-0004 — ESXi/vCenter OpenSLP RCE (CVE-2021-22045)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2021-22045 |
| CVSS | 8.4 (High) |
| 영향 제품 | ESXi 7.0 U1~U2, ESXi 6.7.x, vCenter 6.5 |
| 취약점 유형 | OpenSLP 힙 오버플로우 (두 번째 SLP 취약점) |
| 발표일 | 2022-01-04 |
| 악용 여부 | 제한적 (SLP 비활성화로 완화 가능) |

**Remediation**:
```bash
# 완화: SLP 비활성화 (VMSA-2021-0002와 동일한 완화책)
/etc/init.d/slpd stop
chkconfig slpd off

# 수정 버전:
# ESXi 7.0: ESXi70U3c-19193900 이상
```

> **Reference**: [VMSA-2022-0004](https://www.vmware.com/security/advisories/VMSA-2022-0004.html)

---

### 12.5 VMSA-2023-0001 — vRealize Log Insight RCE (CVE-2022-31703, CVE-2022-31704)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2022-31703 (CVSS 9.8), CVE-2022-31704 (CVSS 9.8) |
| CVSS | 9.8 (Critical) |
| 영향 제품 | VMware vRealize Log Insight < 8.10.2 |
| 취약점 유형 | 디렉토리 트래버설 + RCE (인증 불필요) |
| 발표일 | 2023-01-24 |

**Remediation**:
```bash
# 임시 완화: 외부 접근 차단
# vRealize Log Insight 포트 9000, 9543 외부 접근 차단

# 수정 버전: vRealize Log Insight 8.10.2 이상으로 업그레이드
# Lifecycle Manager를 통한 업그레이드 수행
```

> **Reference**: [VMSA-2023-0001](https://www.vmware.com/security/advisories/VMSA-2023-0001.html)

---

### 12.6 VMSA-2023-0014 — vCenter Server 다중 취약점 (CVE-2023-20892 외)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2023-20892 (CVSS 8.1), CVE-2023-20893 (CVSS 8.1), CVE-2023-20894 (CVSS 8.2), CVE-2023-20895 (CVSS 8.1), CVE-2023-20896 (CVSS 5.9) |
| 영향 제품 | vCenter Server 7.0, 8.0 |
| 취약점 유형 | DCERPC 메모리 손상, Use-After-Free, Out-of-Bounds Read |
| 발표일 | 2023-06-22 |

**Remediation**:
```bash
# 수정 버전:
# - vCenter 7.0: 7.0 U3m (21784236) 이상
# - vCenter 8.0: 8.0 U1b (21815093) 이상

# 임시 완화: DCERPC 포트 차단
# vCenter 포트 2012, 2014, 2020 외부 접근 방화벽 차단
```

> **Reference**: [VMSA-2023-0014](https://www.vmware.com/security/advisories/VMSA-2023-0014.html)

---

### 12.7 VMSA-2024-0006 — ESXi Heap Overflow (CVE-2024-22252, CVE-2024-22253, CVE-2024-22254, CVE-2024-22255)

| 항목 | 내용 |
|------|------|
| CVE | CVE-2024-22252 (CVSS 9.3), CVE-2024-22253 (CVSS 9.3), CVE-2024-22254 (CVSS 8.4), CVE-2024-22255 (CVSS 7.9) |
| CVSS | 9.3 (Critical) |
| 영향 제품 | ESXi 7.0, 8.0; Workstation 17; Fusion 13 |
| 취약점 유형 | UHCI/OHCI USB 컨트롤러 Use-After-Free → VM escape |
| 발표일 | 2024-03-05 |
| 악용 여부 | Pwn2Own 2024에서 시연됨 |

**Remediation 워크플로우**:

```bash
# [Step 1] 현재 ESXi 버전 확인
esxcli system version get

# [Step 2] 즉시 완화 — USB 컨트롤러 제거 (VM 재시작 필요)
# 모든 VM에서 USB 컨트롤러 제거:
# vSphere Client > VM > Edit Settings > USB Controller > Remove

# PowerCLI로 USB 컨트롤러 현황 확인
Get-VM | ForEach-Object {
    $vm = $_
    $usbDevices = $vm | Get-View | Select-Object -ExpandProperty Config |
        Select-Object -ExpandProperty Hardware |
        Select-Object -ExpandProperty Device |
        Where-Object { $_.GetType().Name -like "*USB*" }
    if ($usbDevices) {
        Write-Host "VM with USB: $($vm.Name)"
    }
}

# [Step 3] 패치 적용
# 수정 버전:
# - ESXi 7.0: ESXi70U3p-23307199 이상
# - ESXi 8.0: ESXi80U2b-23305546 이상
```

> **Reference**: [VMSA-2024-0006](https://www.vmware.com/security/advisories/VMSA-2024-0006.html)

---

### 12.8 VMSA-2024-0010 — vCenter DCERPC RCE (VMSA-2024-0012의 선행 패치)

해당 어드바이저리는 `security-advisories.md`의 VMSA-2024-0012로 통합 수록되어 있다.

---

### 12.9 VMSA Remediation 공통 워크플로우 / Common VMSA Remediation Workflow

모든 VMSA에 적용 가능한 표준화된 remediation 절차:

```
[Phase 1: 평가 / Assess] (패치 발표 후 24시간 이내)
1. CVSS 점수 및 악용 여부 확인
2. 현재 환경 버전과 취약 버전 비교
3. 영향받는 호스트/서비스 목록 작성
4. 비즈니스 영향도 평가 (프로덕션/개발/테스트)

[Phase 2: 완화 / Mitigate] (P0/P1의 경우 즉시)
1. 취약 서비스 비활성화 또는 접근 제한
2. 네트워크 레벨 임시 차단 적용
3. 완화 적용 결과 검증
4. 모니터링 강화 (SIEM 알럿 임계값 조정)

[Phase 3: 패치 계획 / Plan] (P0: 48h, P1: 7일, P2: 30일)
1. 패치 파일 다운로드 및 체크섬 검증
2. 테스트 환경에서 패치 적용 및 검증
3. 롤백 계획 수립 (스냅샷 또는 백업)
4. 패치 창 예약 및 이해관계자 통보

[Phase 4: 패치 적용 / Apply]
1. 대상 호스트/서비스 maintenance mode 진입
2. VM 마이그레이션 (HA/DRS 활용)
3. 패치 적용
4. 패치 적용 후 버전 검증
5. 서비스 재시작 및 기능 검증

[Phase 5: 검증 및 문서화 / Verify & Document]
1. 보안 점검 스크립트 재실행
2. 취약점 스캐너 재스캔
3. 패치 적용 결과 변경 관리 시스템 기록
4. 패치 후 SIEM 이상 이벤트 24시간 모니터링
```

```powershell
# VMSA 패치 적용 전 환경 스냅샷 스크립트
# 패치 적용 전 실행 — 롤백 포인트 생성

$vcenter = "vcenter.example.com"
$snapshotName = "Pre-Patch-$(Get-Date -Format 'yyyyMMdd')"

Connect-VIServer -Server $vcenter -Credential (Get-Credential)

# 패치 대상 호스트의 VM들에 스냅샷 생성
$targetCluster = "Production-Cluster"
$vms = Get-Cluster $targetCluster | Get-VM | Where-Object { $_.PowerState -eq "PoweredOn" }

foreach ($vm in $vms) {
    Write-Host "Creating snapshot for: $($vm.Name)"
    New-Snapshot -VM $vm -Name $snapshotName -Description "Pre-VMSA patch snapshot" -Confirm:$false
}

Write-Host "Snapshots created for $($vms.Count) VMs. Proceed with patching."
Write-Host "IMPORTANT: Remove snapshots within 72 hours after patch validation."
```
