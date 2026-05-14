# Removing the last active member silently deletes the household

When the last active member removes themselves from a household, the household is automatically deleted rather than returning an error or requiring a separate "delete household" action. We chose this because forcing users to take an extra explicit step to clean up an empty household adds friction with no benefit — an ownerless household with no active members is inert and unreachable. The cascade deletion (tasks, pending members, invite tokens) is the correct outcome and makes the system self-cleaning.

**Considered options:**
- Block self-removal with a 409 and require explicit household deletion — rejected: makes the user do two steps when one intent is clear
- Silent cascade delete — chosen
