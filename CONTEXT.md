# Recurring Task Tracker

A shared household task tracker where users can manage recurring tasks alone or as part of one or more households.

## Language

**User**:
A registered account identified by a unique username and a unique email address. Either can be used to log in.
_Avoid_: Account, profile, person

**Username**:
A unique, human-chosen display name used to identify a user within the app and as one of two valid login identifiers.
_Avoid_: Name, handle, login name

**Email**:
A unique address stored per user, used as a second login identifier and as the delivery target for password reset links. Not verified on registration — users are active immediately.
_Avoid_: Email address (just "email" is canonical)

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

## Account flows

**Registration**: Open — any visitor can create an account with a username, email, and password. Active immediately, no email verification required. Entry point: `/register` page, linked from the login page ("Don't have an account? Sign up").

**Login identifier**: Either username or email, plus password.

**Password Reset**: User submits their email → receives a time-limited link (valid 1 hour) → sets a new password → link is invalidated (single-use token, hard-deleted on use).

**Account Deletion**: Hard delete — personal tasks deleted, household memberships removed (triggering household auto-delete if they are the last active member). All foreign keys to the user are CASCADE deleted or SET NULL per existing schema rules.

**Profile Updates**: Users can change their username and email after registration. Both changes require the current password to confirm.

**Settings Page**: Covers identity only — change username, change email, change password, delete account. Household management stays on the Households page. Accessible via a "Settings" button in the Dashboard header alongside "Households" and "Log out".

**Password Policy**: Minimum 8 characters. Rejected if `zxcvbn` score < 2 (catches common passwords, keyboard patterns, dictionary words). Enforced on backend; real-time feedback shown on frontend.

## Flagged ambiguities

- "personal task" vs "unassigned task" — resolved: a task with `household_id = NULL` is a **Personal Task**, private to its `owner_id`. It is never globally visible.
