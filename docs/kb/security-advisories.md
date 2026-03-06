# VMware Security Advisories (VMSA) Reference

> Source: [Broadcom Security Advisories](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories), [CISA KEV Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)

## Critical Advisories (2021-2023)

### VMSA-2021-0002 (2021-02) — ACTIVELY EXPLOITED (ESXiArgs 2023)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2021-21974 | 8.8 | ESXi 7.0, 6.7, 6.5 | OpenSLP heap overflow → unauthenticated RCE (port 427) | **YES** |

**Fix**: ESXi 7.0 U1c (17325551), ESXi670-202102401-SG, ESXi650-202102101-SG
- Exploited massively in ESXiArgs ransomware campaign (2023-02-03)
- **Immediate mitigation**: `/etc/init.d/slpd stop && chkconfig slpd off`

> **Reference**: [VMSA-2021-0002](https://www.vmware.com/security/advisories/VMSA-2021-0002.html)

---

### VMSA-2021-0010 (2021-05) — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2021-21985 | 9.8 | vCenter Server 7.0, 6.7, 6.5 | vSAN Health Check plugin RCE (unauthenticated) | **YES** |
| CVE-2021-21986 | 6.5 | vCenter Server 7.0, 6.7, 6.5 | vSphere Client auth mechanism flaw | - |

**Fix**: vCenter 7.0 U2b (17958471), vCenter 6.7 U3n (17994927), vCenter 6.5 U3p
- Exploited within hours of disclosure; mass scanning began immediately
- **Immediate mitigation**: Disable vSAN Health Check plugin in vSphere Client > Administration > Solutions > Client Plugins

> **Reference**: [VMSA-2021-0010](https://www.vmware.com/security/advisories/VMSA-2021-0010.html)

---

### VMSA-2021-0020 (2021-09) — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2021-22005 | 9.8 | vCenter Server 7.0, 6.7 | Analytics service arbitrary file upload → RCE | **YES** |

**Fix**: vCenter 7.0 U3a (18356165), vCenter 6.7 U3o (18485166)
- Exploited within 24 hours of disclosure
- **Immediate mitigation**: Run VMware-provided workaround script (KB 85717): `python /usr/lib/vmware-analytics/scripts/CVE-2021-22005-WORKAROUND.py --enable`

> **Reference**: [VMSA-2021-0020](https://www.vmware.com/security/advisories/VMSA-2021-0020.html)

---

### VMSA-2021-0028 (2021-12) — Log4Shell — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2021-44228 | 10.0 | vCenter Server 7.0, 6.7, 6.5; vRealize products | Log4j JNDI injection → RCE | **YES** |
| CVE-2021-45046 | 9.0 | vCenter Server 7.0, 6.7, 6.5 | Log4j bypass of CVE-2021-44228 fix | **YES** |

**Fix**: vCenter 7.0 U3c (19480866), vCenter 6.7 U3o, vCenter 6.5 U3t
- **Immediate mitigation**: Run `python vc_log4j_mitigator.py` (KB 87081)

> **Reference**: [VMSA-2021-0028](https://www.vmware.com/security/advisories/VMSA-2021-0028.html)

---

### VMSA-2022-0004 (2022-01)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2021-22045 | 8.4 | ESXi 7.0 U1–U2, 6.7.x | OpenSLP heap overflow (second SLP vuln) | Limited |

**Fix**: ESXi 7.0 U3c (19193900)
- **Mitigation**: Same as VMSA-2021-0002 — disable slpd service

> **Reference**: [VMSA-2022-0004](https://www.vmware.com/security/advisories/VMSA-2022-0004.html)

---

### VMSA-2022-0011 (2022-04) — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2022-22954 | 9.8 | Workspace ONE Access, Identity Manager, vRealize Automation | Server-Side Template Injection → unauthenticated RCE | **YES** |
| CVE-2022-22955 | 9.8 | Workspace ONE Access | OAuth2 ACS auth bypass | - |
| CVE-2022-22956 | 9.8 | Workspace ONE Access | OAuth2 ACS auth bypass | - |
| CVE-2022-22957 | 9.1 | Workspace ONE Access, Identity Manager, vRealize Automation | JDBC deserialization RCE | - |
| CVE-2022-22958 | 9.1 | Workspace ONE Access, Identity Manager, vRealize Automation | JDBC deserialization RCE | - |
| CVE-2022-22959 | 8.8 | Workspace ONE Access, Identity Manager, vRealize Automation | CSRF | - |
| CVE-2022-22960 | 7.8 | Workspace ONE Access, Identity Manager, vRealize Automation | Local privilege escalation | - |

**Fix**: Workspace ONE Access 21.08.0.1, Identity Manager 3.3.6, vRealize Automation 7.6 patch
- Exploited within 48 hours of disclosure
- **Mitigation**: Block external access to management interface at network perimeter

> **Reference**: [VMSA-2022-0011](https://www.vmware.com/security/advisories/VMSA-2022-0011.html)

---

### VMSA-2023-0001 (2023-01)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2022-31703 | 9.8 | vRealize Log Insight < 8.10.2 | Directory traversal → unauthenticated RCE | - |
| CVE-2022-31704 | 9.8 | vRealize Log Insight < 8.10.2 | Broken access control → unauthenticated RCE | - |
| CVE-2022-31706 | 9.8 | vRealize Log Insight < 8.10.2 | Directory traversal | - |
| CVE-2022-31711 | 5.3 | vRealize Log Insight < 8.10.2 | Information disclosure | - |

**Fix**: vRealize Log Insight 8.10.2
- **Mitigation**: Block external access to ports 9000, 9543

> **Reference**: [VMSA-2023-0001](https://www.vmware.com/security/advisories/VMSA-2023-0001.html)

---

### VMSA-2023-0014 (2023-06)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2023-20892 | 8.1 | vCenter Server 7.0, 8.0 | DCERPC heap-overflow | - |
| CVE-2023-20893 | 8.1 | vCenter Server 7.0, 8.0 | DCERPC use-after-free | - |
| CVE-2023-20894 | 8.2 | vCenter Server 7.0, 8.0 | DCERPC out-of-bounds write | - |
| CVE-2023-20895 | 8.1 | vCenter Server 7.0, 8.0 | DCERPC memory corruption | - |
| CVE-2023-20896 | 5.9 | vCenter Server 7.0, 8.0 | DCERPC out-of-bounds read | - |

**Fix**: vCenter 7.0 U3m (21784236), vCenter 8.0 U1b (21815093)
- **Mitigation**: Block DCERPC ports 2012, 2014, 2020 at perimeter firewall

> **Reference**: [VMSA-2023-0014](https://www.vmware.com/security/advisories/VMSA-2023-0014.html)

---

### VMSA-2023-0023 (2023-10) — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2023-34048 | 9.8 | vCenter Server 7.0, 8.0 | DCERPC out-of-bounds write → pre-auth RCE | **YES** |
| CVE-2023-34056 | 4.3 | vCenter Server 7.0, 8.0 | Partial information disclosure | - |

**Fix**: vCenter 7.0 U3o (22357613), vCenter 8.0 U2 (22385739)
- Exploited by APT groups in late 2023 – early 2024
- No official workaround — **patch immediately**
- **Network mitigation**: Restrict ports 443, 8443, 2012, 2014, 2020 to management IPs only

> **Reference**: [VMSA-2023-0023](https://www.vmware.com/security/advisories/VMSA-2023-0023.html)

---

## Critical Advisories (2024-2026)

### VMSA-2026-0001 (2026-02) — POTENTIAL EXPLOITATION
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2026-22719 | **9.1** | VMware Aria Operations | Command injection → unauthenticated RCE | **Potential** |
| CVE-2026-22720 | 8.0 | VMware Aria Operations | Stored XSS → admin action execution | - |
| CVE-2026-22721 | 6.2 | VMware Aria Operations | Privilege escalation | - |

**Fix**: Aria Operations 8.18.3 HF4
- VMSA-2026-0001.1 (2026-03-03): Broadcom이 잠재적 악용 보고를 인지하였으나 독립적 확인 불가
- **Immediate mitigation**: Aria Operations 관리 인터페이스를 내부 관리 네트워크로 제한

> **Reference**: [VMSA-2026-0001](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/36947)

---

### VMSA-2025-0016 (2025-09)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-41250 | 8.5 | vCenter Server | SMTP header injection | - |
| CVE-2025-41251 | - | vCenter Server | (NSA 보고) | - |
| CVE-2025-41252 | 7.5 | VMware NSX | Username enumeration → unauthorized access | - |

**Fix**: vCenter 7.0 U3w (24614210), vCenter 8.0 U3g (24853646), NSX patches
- CVE-2025-41251은 NSA(미국 국가안보국)가 보고

> **Reference**: [VMSA-2025-0016](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/36150)

---

### VMSA-2025-0015 (2025-09) — ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-41244 | 7.8 | VMware Tools (Windows/Linux) | Local privilege escalation | **YES** |
| CVE-2025-41245 | 4.9 | VMware Aria Operations | Information disclosure (credential leak) | - |
| CVE-2025-41246 | - | VMware Tools | - | - |

**Fix**: VMware Tools 12.5.4 (build 24964629), open-vm-tools `stable-12.5.4`
- VMSA-2025-0015.1 (2025-10-30): CVE-2025-41244 야생 악용 확인
- Linux: open-vm-tools는 OS 벤더를 통해 패치 배포

> **Reference**: [VMSA-2025-0015](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/36149)

---

### VMSA-2025-0013 (2025-07)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-41236 | **9.3** | ESXi, Workstation, Fusion | VMXNET3 integer-overflow → VM escape (code execution on host) | - |
| CVE-2025-41237 | **9.3** | ESXi, Workstation, Fusion | VMCI integer-underflow → OOB write → sandbox escape | - |
| CVE-2025-41238 | **9.3** | ESXi, Workstation, Fusion | PVSCSI heap-overflow → OOB write → code execution as VMX | - |
| CVE-2025-41239 | 7.1 | VMware Tools | vSockets information disclosure (uninitialized memory) | - |

**Fix**: ESXi 7.0 U3w (24784741), ESXi 8.0 U3f (24784735) / U3g (24859861)
- 3개의 Critical (CVSS 9.3) — 모두 로컬 관리자 권한 가진 VM에서 호스트 레벨 코드 실행 가능
- **Mitigation**: VMXNET3, PVSCSI, VMCI 비활성화는 비현실적 — **패치 필수**

---

### VMSA-2025-0010 (2025-05)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-41225 | 8.8 | vCenter Server | Arbitrary command execution | - |
| CVE-2025-41226 | 6.8 | ESXi | DoS | - |
| CVE-2025-41227 | 6.8 | ESXi, Workstation, Fusion | DoS | - |
| CVE-2025-41228 | 4.3 | vCenter Server | XSS | - |

**Fix**: vCenter 7.0 U3x (24730281), ESXi 7.0 U3v (24723872)

---

### VMSA-2025-0004 (2025-03) -- ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-22224 | **9.3** | ESXi, Workstation, Fusion | VMCI heap-overflow (VM escape) | **YES** |
| CVE-2025-22225 | 8.2 | ESXi | Kernel arbitrary write (sandbox escape) | **YES** |
| CVE-2025-22226 | 7.1 | ESXi, Workstation, Fusion | HGFS information disclosure | **YES** |

**Fix**: ESXi 7.0 U3s (24585291), ESXi 8.0 U3c
- Attack chain: CVE-2025-22226 (info leak) -> CVE-2025-22225 (kernel write) -> CVE-2025-22224 (code execution)
- CISA KEV added: 2025-03-04

---

### VMSA-2024-0019 (2024-09, updated 2024-11) -- ACTIVELY EXPLOITED
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2024-38812 | **9.8** | vCenter Server | DCERPC heap-overflow RCE | **YES** |
| CVE-2024-38813 | 7.2 | vCenter Server | Privilege escalation | **YES** |

**Fix**: vCenter 7.0 U3t (24322018), vCenter 8.0 U3b
- Original patches (Sep 2024) were insufficient; re-patched Oct 2024
- CISA KEV added: 2024-11-20

---

### VMSA-2024-0013 (2024-06)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2024-37085 | 6.8 | ESXi | AD authentication bypass | **YES** |
| CVE-2024-37086 | 5.9 | ESXi | Out-of-bounds read | - |
| CVE-2024-37087 | 5.3 | vCenter | SSRF | - |

**Fix**: ESXi 7.0 U3r (24411414)
- Used by ransomware groups (Storm-0506, Akira, Black Basta)
- Exploits AD-joined ESXi: attacker creates "ESX Admins" AD group

---

### VMSA-2024-0012 (2024-06)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2024-37079 | **9.8** | vCenter Server | DCERPC heap-overflow RCE | - |
| CVE-2024-37080 | **9.8** | vCenter Server | DCERPC heap-overflow RCE | - |
| CVE-2024-37081 | 7.8 | vCenter Server (Linux) | Local privilege escalation | - |

**Fix**: vCenter 7.0 U3r, 8.0 U2d

---

## Patch Priority Matrix

| Priority | Criteria | Action |
|----------|----------|--------|
| **P0 - Emergency** | CVSS >= 9.0 AND actively exploited | Patch within 48 hours |
| **P1 - Critical** | CVSS >= 9.0 OR actively exploited | Patch within 1 week |
| **P2 - High** | CVSS 7.0-8.9, not exploited | Patch within 30 days |
| **P3 - Medium** | CVSS 4.0-6.9 | Patch in next maintenance window |

---

## Version Compatibility Quick Check

To check if your environment is vulnerable:

```powershell
# Get current builds
$vcBuild = ($global:DefaultVIServer).Build
$esxiBuilds = Get-VMHost | Select Name, Build

# === vSphere 7.0 fix builds ===
$fixes70 = @{
    "VMSA-2025-0013 (ESXi 7.0)" = @{ Build = 24784741; Name = "7.0 U3w" }
    "VMSA-2025-0016 (vCenter 7.0)" = @{ Build = 24614210; Name = "7.0 U3w" }
    "VMSA-2025-0004 (ESXi 7.0)" = @{ Build = 24585291; Name = "7.0 U3s" }
    "VMSA-2024-0019 (vCenter 7.0)" = @{ Build = 24322018; Name = "7.0 U3t" }
}

# === vSphere 8.0 fix builds ===
$fixes80 = @{
    "VMSA-2026-0001 (ESXi 8.0)" = @{ Build = 25205845; Name = "8.0 U3i" }
    "VMSA-2025-0013 (ESXi 8.0)" = @{ Build = 24784735; Name = "8.0 U3f" }
    "VMSA-2025-0004 (ESXi 8.0)" = @{ Build = 24585383; Name = "8.0 U3d" }
    "VMSA-2024-0019 (vCenter 8.0)" = @{ Build = 24322831; Name = "8.0 U3d" }
}

# Check vCenter (latest critical fix)
$vcLatestFix = 24614210  # 7.0 U3w for vSphere 7.0
# Use 25197330 for vSphere 8.0 (8.0 U3i)
if ([int]$vcBuild -lt $vcLatestFix) {
    Write-Warning "vCenter is BEHIND latest security patches - current: $vcBuild"
}

# Check ESXi hosts
$esxiLatestFix = 24784741  # 7.0 U3w for vSphere 7.0
# Use 25205845 for vSphere 8.0 (8.0 U3i)
foreach ($h in $esxiBuilds) {
    if ([int]$h.Build -lt $esxiLatestFix) {
        Write-Warning "$($h.Name) is BEHIND latest security patches - current: $($h.Build)"
    }
}

# Detailed VMSA check (7.0 example)
foreach ($vmsa in $fixes70.GetEnumerator()) {
    foreach ($h in $esxiBuilds) {
        if ([int]$h.Build -lt $vmsa.Value.Build) {
            Write-Warning "$($h.Name) VULNERABLE to $($vmsa.Key) - need $($vmsa.Value.Name) ($($vmsa.Value.Build))"
        }
    }
}
```

---

## Active Exploitation Timeline (야생 악용 타임라인)

| VMSA | CVE | 악용 확인 시점 | 공격 유형 | CISA KEV |
|------|-----|--------------|-----------|:--------:|
| VMSA-2026-0001 | CVE-2026-22719 | 2026-03 (잠재적) | Aria Ops RCE | TBD |
| VMSA-2025-0015 | CVE-2025-41244 | 2025-10 | VMware Tools LPE | - |
| VMSA-2025-0004 | CVE-2025-22224/22225/22226 | 2025-03 | VM escape chain | **YES** |
| VMSA-2024-0019 | CVE-2024-38812/38813 | 2024-11 | vCenter DCERPC RCE | **YES** |
| VMSA-2024-0013 | CVE-2024-37085 | 2024-06 | ESXi AD auth bypass (ransomware) | **YES** |
| VMSA-2023-0023 | CVE-2023-34048 | 2023-10 | vCenter DCERPC RCE (APT) | **YES** |
| VMSA-2021-0002 | CVE-2021-21974 | 2023-02 | ESXi SLP RCE (ESXiArgs ransomware) | **YES** |
