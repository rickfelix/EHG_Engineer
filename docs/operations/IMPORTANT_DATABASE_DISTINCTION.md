# IMPORTANT: Database Distinction

## Two Separate Databases - Don't Confuse Them!

### 1. 🛠️ EHG_Engineer Database (ID: dedlbzhpgkmetvhbkyzq)
- **Purpose**: Powers the EHG_Engineer application itself
- **What it's for**: This is the database for the LEO Protocol system you're currently using
- **Contains**: LEO Protocol data, configurations, agent states, etc.
- **This is NOT your project database**

### 2. 🎯 EHG Database (ID: liapbndqlqxdcgpwntbv)
- **Purpose**: The actual EHG project/application database
- **What it's for**: This is the database for the EHG application being built
- **Contains**: EHG application data (users, ventures, portfolio, etc.)
- **This IS your project database**

## Simple Rule:
- **EHG_Engineer** = The tool you're using to build
- **EHG** = The project you're building

## In LEO Protocol Context:

When working with the EHG project in LEO Protocol:
- The LEO system uses: `ehg_engineer` database
- Your project uses: `ehg` database

## Supabase Projects Mapping:

| Project Name | Supabase ID | Purpose | 
|-------------|-------------|---------|
| ehg_engineer | dedlbzhpgkmetvhbkyzq | LEO Protocol/Builder Tool |
| ehg | liapbndqlqxdcgpwntbv | The actual EHG application |
| ehg-platform | nxchardjdnvvlufhrumr | Alternative/staging version |
| ehg-platform-dev | jmqfmjadlvgyduupeexl | Development version |

## When Connecting:

### For LEO Protocol operations:
```bash
supabase link --project-ref dedlbzhpgkmetvhbkyzq  # EHG_Engineer
```

### For EHG project development:
```bash
supabase link --project-ref liapbndqlqxdcgpwntbv  # EHG (the actual project)
```

## Remember:
**Never confuse the builder tool (EHG_Engineer) with the project being built (EHG)**