# Invite tokens are deleted on use, not soft-deleted

Invite tokens are removed from the database the moment they are consumed (or when accessed after expiry), rather than retained with a `used_at` timestamp. We chose this because tokens have no value after use — the membership row they created is the durable record. Keeping consumed tokens would only be useful for auditing "who invited whom and when", but that information is already captured in `household_members.invited_by_id` and `household_members.created_at`.

**Considered options:**
- Soft-delete with `used_at` timestamp — rejected: redundant with membership record, adds a column with no query use case
- Hard delete on use — chosen
