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
