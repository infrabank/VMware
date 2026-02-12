# vCenter Server Troubleshooting Guide

## vCenter Services Not Starting

### Diagnostic Steps (VCSA)
```bash
# SSH into VCSA
# Check all service status
service-control --status --all

# Key services:
# vmware-vpxd        — vCenter Server daemon
# vmware-vpostgres   — Embedded PostgreSQL database
# vmware-stsd        — Security Token Service
# vmware-sps         — Storage Profile Service
# vmware-content-library — Content Library
```

### Common Service Failures

#### vpxd won't start
```bash
# Check vpxd logs
tail -200 /var/log/vmware/vpxd/vpxd.log

# Common causes:
# 1. Database connection failure → check vpostgres
# 2. Certificate expired → check STS certificate
# 3. Out of disk space → check partition usage
df -h
```

#### vpostgres won't start
```bash
# Check postgres logs
tail -100 /var/log/vmware/vpostgres/postgresql*.log

# Check disk space (common cause)
df -h /storage/

# Manual DB recovery (CRITICAL risk)
# Only attempt with VMware Support guidance
/opt/vmware/vpostgres/current/bin/pg_resetwal /storage/db/vpostgres/
```

### Service Restart Order
When restarting services, order matters:
```bash
# Stop in reverse dependency order
service-control --stop --all

# Start in dependency order
service-control --start vmware-vpostgres
service-control --start vmware-stsd
service-control --start vmware-vpxd
service-control --start --all    # remaining services
```

---

## STS Certificate Expiration (CRITICAL)

### Symptoms
- Cannot login to vCenter (SSO errors)
- Services fail to start
- "400 Bad Request" in vpxd.log

### Diagnosis
```bash
# Check STS certificate expiration
# On VCSA:
for store in $(/usr/lib/vmware-vmafd/bin/vecs-cli store list); do
    echo "=== $store ==="
    /usr/lib/vmware-vmafd/bin/vecs-cli entry list --store $store --text | grep -A2 "Not After"
done

# Quick check via Python script
/usr/lib/vmware-vmafd/bin/dir-cli trustedcert list --login administrator@vsphere.local
```

### Resolution
- **vSphere 7.0 U1+**: Use `/usr/lib/vmware-vmca/bin/certificate-manager` option 8
- **vSphere 6.x / 7.0**: Use VMware KB 79248 fixsts script
  ```bash
  # Download and run fixsts (follow KB79248 exactly)
  python /tmp/fixsts.py
  ```
- **After certificate renewal**: Restart all services and re-trust in all connected solutions

### Reference
- KB79248 — How to regenerate STS certificate
- KB76719 — vCenter certificate expiration checklist

---

## vCenter Backup & Restore (VCSA)

### File-Based Backup
```bash
# Via VAMI (https://vcsa:5480)
# Backup & Restore > Backup

# API-based backup
curl -k -X POST "https://vcsa/api/appliance/recovery/backup/job" \
  -H "vmware-api-session-id: <session>" \
  -H "Content-Type: application/json" \
  -d '{"piece":{"location_type":"FTP","location":"ftp://backup-server/vcsa-backup","location_user":"user","location_password":"pass"}}'
```

### Restore
```bash
# VCSA must be deployed fresh from ISO
# During setup, choose "Restore from backup"
# Point to backup location
```

### Backup Best Practices
- Schedule daily backups minimum
- Test restore procedure quarterly
- Backup before ANY upgrade or major change
- Keep at least 3 backup generations
- Backup location should be independent of vCenter-managed storage

---

## vCenter Performance Issues

### Diagnostic Steps
```bash
# Check VCSA resource usage
top
df -h
free -m

# Check vpxd stats
/usr/lib/vmware-vpx/inventoryStats.sh

# Database size
du -sh /storage/db/vpostgres/

# Check database bloat
psql -U postgres -d VCDB -c "SELECT pg_size_pretty(pg_database_size('VCDB'));"
```

### Common Causes
| Symptom | Cause | Fix |
|---------|-------|-----|
| Slow UI | Large inventory + stats DB bloat | DB vacuum, increase resources |
| Login timeout | STS service overloaded | Restart vmware-stsd |
| Task queue stuck | vpxd thread exhaustion | Restart vpxd |
| Disk 90%+ | Stats/events/tasks data growth | Purge old data, adjust retention |

### Database Maintenance
```bash
# Vacuum database (MEDIUM risk — can be I/O intensive)
psql -U postgres -d VCDB -c "VACUUM FULL VERBOSE;"

# Check and reduce stats retention
# vSphere Client > Administration > vCenter Settings > Statistics
# Reduce retention or interval if DB is too large
```

---

## vCenter Upgrade Paths

### Key Rules
- Always check VMware Interoperability Matrix before upgrading
- vCenter version must be >= ESXi version
- Upgrade vCenter FIRST, then ESXi hosts
- External PSC is deprecated in vSphere 7.0+ (converged only)

### Common Upgrade Paths
```
6.5 → 6.7 → 7.0 → 8.0
6.7 → 7.0 → 8.0
7.0 → 8.0
```

### Pre-Upgrade Checklist
- [ ] Take VCSA file-based backup
- [ ] Take VM snapshot of VCSA (if appliance)
- [ ] Check disk space requirements
- [ ] Verify DNS resolution (forward AND reverse)
- [ ] Check certificate expiration
- [ ] Verify NTP sync
- [ ] Review release notes for known issues
- [ ] Document current config (networking, SSO, permissions)

---

## SSO / Authentication Issues

### Cannot Login to vCenter

```bash
# Check SSO domain
/usr/lib/vmware-vmafd/bin/vmafd-cli get-domain-name --server-name localhost

# Check identity sources
sso-config.sh -get_identity_sources

# Test LDAP connectivity (if AD identity source)
ldapsearch -H ldap://dc.example.com -D "cn=svc-vcenter,ou=service,dc=example,dc=com" -w 'password' -b "dc=example,dc=com" "(sAMAccountName=testuser)"
```

### Password Expired
```bash
# Reset administrator@vsphere.local password (VCSA)
/usr/lib/vmware-vmdir/bin/vdcadmintool
# Option 3: Reset account password
```

### Reference
- KB2146224 — Troubleshooting SSO issues
- KB2150VMware — Reset SSO admin password
