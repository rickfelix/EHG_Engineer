# Archive

This directory contains archived documentation that is no longer active but preserved for historical reference and context.

## Metadata
- **Category**: archive
- **Status**: archived
- **Last Updated**: 2025-10-24

---

## Archive Contents

### Protocols Archive
**Location**: `protocols/`
**Contents**: Archived LEO Protocol versions (v3.x, v4.0, v4.1)
**Count**: 7 protocol files
**See**: [protocols/README.md](protocols/README.md)

### Temporary Files
**Location**: `temp/`
**Contents**: Temporary files pending archival or deletion
**Status**: Under review

### Other Archived Files
- `temp-implementation-roadmap.md` - Temporary implementation roadmap (superseded)

---

## Recent Archive Activity

### 2025-10-24: Protocol Archive

**Archived**: 7 protocol versions
**From**: `/docs/03_protocols_and_standards/`
**To**: `/docs/archive/protocols/`
**Reason**: Superseded by LEO Protocol v4.3.3

**Files Archived**:
- leo_protocol_v3.1.5.md (83KB)
- leo_protocol_v3.1.6_improvements.md
- leo_protocol_v3.3.0_boundary_context_skills.md
- leo_protocol_v4.0.md
- leo_protocol_v4.1.md
- leo_protocol_v4.1.1_update.md
- leo_protocol_v4.1.2_database_first.md

---

## Archive Organization

### Current Structure
```
docs/archive/
├── README.md (this file)
├── protocols/          # Archived protocol versions
│   ├── README.md
│   └── leo_protocol_v*.md (7 files)
├── temp/               # Temporary holding area
│   └── README.md
└── temp-implementation-roadmap.md
```

---

## Accessing Archived Content

### Search Archive
```bash
# Search all archived content
grep -r "search term" /mnt/c/_EHG/EHG_Engineer/docs/archive/

# Search protocols only
grep -r "search term" /mnt/c/_EHG/EHG_Engineer/docs/archive/protocols/
```

### View Archived Files
```bash
# List archive contents
ls -lah /mnt/c/_EHG/EHG_Engineer/docs/archive/protocols/

# Read archived file
cat /mnt/c/_EHG/EHG_Engineer/docs/archive/protocols/leo_protocol_v3.1.5.md
```

---

## Navigation

- **Parent**: [Documentation Home](../01_architecture/README.md)
- **Protocols Archive**: [protocols/README.md](protocols/README.md)

---

*Managed by DOCMON Sub-Agent*
