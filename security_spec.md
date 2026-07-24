# Security Specification - SwiftyDrop Workspace

## 1. Data Invariants
- A user cannot modify another user's profile.
- A user cannot post a message as someone else (senderId spoofing).
- A user cannot delete files they don't own.
- Messages must belong to an existing channel.
- File metadata must include a valid owner ID matching the uploader.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing (User Profile):** User A trying to update User B's status.
2. **Identity Spoofing (Message):** User A sending a message with `senderId: "userB"`.
3. **Identity Spoofing (File):** User A uploading file metadata with `ownerId: "userB"`.
4. **State Poisoning:** User sending a message with a 1MB string as `content`.
5. **Relational Sync Failure:** Creating a message for a channel ID that doesn't exist.
6. **Immutable Field Attack:** User trying to change their own `email` after creation.
7. **Privilege Escalation:** User trying to join a private channel they aren't a member of.
8. **Resource Exhaustion:** Creating a file metadata entry with negative size or impossible category.
9. **Timestamp Spoofing:** Sending a message with a `timestamp` from the future (manual injection).
10. **Path Poisoning:** Trying to create a file with a document ID containing malicious characters (though Firestore handles IDs, we check size/regex).
11. **PII Leak:** An unauthenticated user trying to read the `users` collection.
12. **Orphaned Message:** User A posting a message to a channel they were kicked out of.

## 3. Implementation Plan
- Use `isValidUser`, `isValidMessage`, `isValidFile`, `isValidChannel` helpers.
- Enforce strict key checks with `affectedKeys().hasOnly()`.
- Use `get()` to verify membership in channels.
- Enforce server timestamps for `lastSeen` and `timestamp`.
