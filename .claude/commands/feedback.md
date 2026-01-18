# /feedback - Feedback Management (Alias)

**This is an alias for `/inbox`**

See the full documentation at [inbox.md](./inbox.md).

## Quick Reference

| Command | Description |
|---------|-------------|
| `/feedback` | List open feedback items |
| `/feedback new` | Create new feedback item |
| `/feedback <id>` | View details of specific item |

## Instructions

When the user invokes `/feedback`, execute the same behavior as `/inbox`:

1. Parse `$ARGUMENTS` the same way as `/inbox`
2. Use the same database queries and display formats
3. Use the same error handling

Refer to inbox.md for complete implementation details.
