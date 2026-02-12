# VMware Security Advisories (VMSA) Reference

> Source: [Broadcom Security Advisories](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories), [CISA KEV Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)

## Critical Advisories (2024-2025)

### VMSA-2025-0013 (2025-07)
| CVE | CVSS | Product | Type | Exploited |
|-----|------|---------|------|-----------|
| CVE-2025-41236 | 9.3 | ESXi, Workstation, Fusion | VM escape | - |
| CVE-2025-41237 | 8.2 | ESXi, Workstation, Fusion | Sandbox escape | - |
| CVE-2025-41238 | 7.1 | ESXi, Workstation, Fusion | Information disclosure | - |
| CVE-2025-41239 | - | VMware Tools | - | - |

**Fix**: ESXi 7.0 U3w (24784741), ESXi 8.0 U3d

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

# Compare against fix versions
$vcFixBuild = 24322018   # 7.0 U3t (VMSA-2024-0019 fix)
$esxiFixBuild = 24585291 # 7.0 U3s (VMSA-2025-0004 fix)

if ([int]$vcBuild -lt $vcFixBuild) {
    Write-Warning "vCenter is VULNERABLE - current: $vcBuild, fix: $vcFixBuild"
}
foreach ($h in $esxiBuilds) {
    if ([int]$h.Build -lt $esxiFixBuild) {
        Write-Warning "$($h.Name) is VULNERABLE - current: $($h.Build), fix: $esxiFixBuild"
    }
}
```
