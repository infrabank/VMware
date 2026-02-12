# vSphere Certificate Management & STS Troubleshooting

> Reference: [Broadcom KB 79248](https://knowledge.broadcom.com/external/article/318968), [KB 76719](https://kb.vmware.com/s/article/76719), [KB 83558](https://kb.vmware.com/s/article/83558)

## Certificate Architecture Overview

vCenter Server uses multiple certificates:

| Certificate | Purpose | Default Lifetime | Location |
|------------|---------|-----------------|----------|
| **Machine SSL** | vCenter web services (HTTPS) | 2 years | VECS (MACHINE_SSL_CERT) |
| **STS Signing** | SSO token signing | 2 years | vmdir |
| **VMCA Root** | Internal CA root | 10 years | VECS (TRUSTED_ROOTS) |
| **Solution Users** | Service-to-service auth | 2 years | VECS (various stores) |
| **vpxd-extension** | vCenter extensions | 2 years | VECS (vpxd-extension) |

---

## STS Certificate Expiration (Most Common Issue)

### Symptoms
- vSphere Client login fails: "Unable to authenticate"
- "STS Signing Certificates are about to expire" alarm
- SSO services crash or fail to start
- Backup/restore failures
- PowerCLI `Connect-VIServer` fails

### Check STS Certificate Expiration

```bash
# VCSA SSH - Quick check
for store in $(/usr/lib/vmware-vmafd/bin/vecs-cli store list); do
    echo "=== $store ==="
    /usr/lib/vmware-vmafd/bin/vecs-cli entry list --store "$store" --text | \
        grep -A2 "Alias\|Not After"
done
```

```bash
# Method 2: Using checksts script (KB 79248)
# Download from KB or use built-in
python /usr/lib/vmware-lookupsvc/tools/lstool.py list \
    --url https://localhost/lookupservice/sdk \
    --no-check-cert 2>/dev/null | grep -i "ssl\|endpoint"
```

```bash
# Method 3: Check STS cert directly
/usr/lib/vmware-vmafd/bin/vecs-cli entry getcert \
    --store STS_INTERNAL_SSL_CERT --alias __MACHINE_CERT | \
    openssl x509 -noout -dates
```

### Fix Expired STS Certificate

> **WARNING**: This procedure restarts vCenter services. Plan for 10-20 min downtime.

```bash
# Step 1: SSH to VCSA as root

# Step 2: Download and run fixsts script
# For VCSA (KB 76719):
cd /tmp
# Download fixsts.sh from KB 76719 or use:

# Step 3: Run certificate regeneration
/usr/lib/vmware-vmca/bin/certificate-manager

# Option 8: Reset all certificates (if multiple expired)
# Option 4: Regenerate Solution User certificates
# Option 3: Replace Machine SSL certificate with VMCA

# Step 4: Restart all services
service-control --stop --all
service-control --start --all

# Step 5: Verify
service-control --status --all
```

### Proactive Monitoring

```bash
# Check all certificate expiration dates
/usr/lib/vmware-vmafd/bin/vecs-cli store list | while read store; do
    echo "=== Store: $store ==="
    /usr/lib/vmware-vmafd/bin/vecs-cli entry list --store "$store" 2>/dev/null | \
        grep "Alias" | while read line; do
            alias=$(echo "$line" | awk -F: '{print $2}' | xargs)
            expiry=$(/usr/lib/vmware-vmafd/bin/vecs-cli entry getcert \
                --store "$store" --alias "$alias" 2>/dev/null | \
                openssl x509 -noout -enddate 2>/dev/null)
            echo "  $alias: $expiry"
        done
done
```

---

## Machine SSL Certificate

### Check Expiration
```bash
# VCSA
/usr/lib/vmware-vmafd/bin/vecs-cli entry getcert \
    --store MACHINE_SSL_CERT --alias __MACHINE_CERT | \
    openssl x509 -noout -dates -subject
```

### Renew with VMCA
```bash
/usr/lib/vmware-vmca/bin/certificate-manager
# Select Option 3: Replace Machine SSL certificate with VMCA Certificate
```

---

## ESXi Host Certificates

### Check ESXi Certificate
```bash
# From ESXi shell
openssl x509 -in /etc/vmware/ssl/rui.crt -noout -dates -subject

# From PowerCLI
Get-VMHost | ForEach-Object {
    $cert = ($_ | Get-View).Config.Certificate
    $x509 = [System.Security.Cryptography.X509Certificates.X509Certificate2]$cert
    [PSCustomObject]@{
        Host = $_.Name
        Subject = $x509.Subject
        NotAfter = $x509.NotAfter
        Issuer = $x509.Issuer
    }
}
```

### Renew ESXi Certificate
```
vSphere Client > Host > Configure > Certificate
  > Renew (if using VMCA-signed certificates)
  > Or: Refresh CA Certificates
```

```powershell
# PowerCLI
$vmhost = Get-VMHost "esxi-01"
$certManager = Get-View -Id $vmhost.ExtensionData.ConfigManager.CertificateManager
$certManager.CertMgrRefreshCACertificatesAndCRLs($vmhost.ExtensionData.ConfigManager.CertificateManager)
```

---

## Certificate Manager Tool Reference

```bash
# Interactive certificate management
/usr/lib/vmware-vmca/bin/certificate-manager

# Options:
# 1. Replace Machine SSL certificate with Custom Certificate
# 2. Replace VMCA Root certificate with Custom CA and all Certificates
# 3. Replace Machine SSL certificate with VMCA Certificate
# 4. Regenerate a new VMCA Root Certificate and replace all certificates
# 5. Replace Solution user certificates with Custom Certificate
# 6. Replace Solution user certificates with VMCA certificates
# 7. Revert last performed operation (rollback)
# 8. Reset all Certificates
```

---

## Common Certificate Issues

### "PKIX path building failed"
- CA certificate not trusted
- Fix: Import CA cert into trusted roots

### "Certificate has expired"
- STS or Machine SSL cert expired
- Fix: Use certificate-manager to renew

### "Hostname mismatch"
- Certificate CN/SAN doesn't match FQDN
- Fix: Regenerate cert with correct FQDN
- Check: `openssl x509 -in cert.pem -noout -text | grep -A1 "Subject Alternative Name"`

### Services fail after certificate renewal
```bash
# Full service restart
service-control --stop --all
service-control --start --all

# If still failing, check individual service logs
tail -100 /var/log/vmware/vpxd/vpxd.log
tail -100 /var/log/vmware/sso/ssoAdminServer.log
```
