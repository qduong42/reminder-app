# Recurring Task Tracker

A shared household task tracker where users can manage recurring tasks alone or as part of one or more households.

## Language

**Household**:
A named group of users who share a set of tasks.
_Avoid_: Group, team, family, org

**Member**:
A user who belongs to a household, either as pending or active.
_Avoid_: Participant, user (in household context)

**Active Member**:
A member who has been accepted into a household and can see, create, and complete its tasks.
_Avoid_: Confirmed member, approved member

**Pending Member**:
A member who has joined via an invite link but has not yet been accepted by an active member.
_Avoid_: Invited user, applicant

**Personal Task**:
A task with no household — private to the user who created it, not visible to anyone else.
_Avoid_: Private task, unassigned task

**Household Task**:
A task scoped to a household — visible to all active members of that household.
_Avoid_: Shared task, group task

**Invite Token**:
A single-use, time-limited (24h) alphanumeric code that grants one person the ability to join a specific household as a pending member.
_Avoid_: Invite link, invite code (link is the URL; token is the code within it)

## Relationships

- A **User** can belong to zero or more **Households** as a **Member**
- A **Member** is either **Pending** or **Active** — never both simultaneously
- Only an **Active Member** can generate an **Invite Token** or accept a **Pending Member**
- Any **Active Member** of the household can accept any **Pending Member**
- A **Personal Task** belongs to exactly one **User** and is invisible to all others
- A **Household Task** belongs to exactly one **Household** and is visible to all its **Active Members**

**Task Feed**:
The default view showing all tasks the user can see — personal tasks plus household tasks from every household they are an active member of.
_Avoid_: All tasks view, global view

**Task Scope**:
A filter applied to the task feed — either "all" (the default feed), "personal" (personal tasks only), or a specific household (that household's tasks only).
_Avoid_: Task filter, task view

## Completion rules

- A **Personal Task** can only be completed by its owner
- A **Household Task** can be completed by any **Active Member** of its household

## Household lifecycle

- A **Household** can be deleted by any **Active Member** via an explicit delete action
- If the last **Active Member** removes themselves, the household is automatically deleted (no extra step required)
- When a **Household** is deleted, all its **Household Tasks**, **Members**, and **Invite Tokens** are deleted (CASCADE)

## Push notification rules

- A **Household Task** deadline notifies all **Active Members** of its household
- A **Personal Task** deadline notifies only its owner
- **Pending Members** never receive household task notifications

## Access rules by member status

| Action | Pending Member | Active Member |
|--------|---------------|---------------|
| Personal tasks (own) | ✅ full access | ✅ full access |
| Household tasks | ❌ | ✅ |
| List household members | ❌ | ✅ |
| Generate invite token | ❌ | ✅ |
| Accept/remove members | ❌ | ✅ |

## Flagged ambiguities

- "personal task" vs "unassigned task" — resolved: a task with `household_id = NULL` is a **Personal Task**, private to its `owner_id`. It is never globally visible.
