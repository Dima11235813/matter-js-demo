# 6. Verify Google sign-in, account switching, and sync (real accounts) ☐

**Why**: automated tests use test personas; only a person with real Google accounts can check the Google path (Epic 6 · Tasks 6.4.1.1, 6.7.5).

**Needs**: item 2.

**Steps** (local: `yarn dev:server` in one terminal, `yarn dev` in another):
* ☐ Play a few analogies as a guest. Menu → shield icon → **Sign in with Google** (answer the age question once). The guest's score appears in the account (the first account on a device adopts the guest's progress).
* ☐ In a second browser (or a private window), sign in with the **same** Google account: after a few seconds both show the same score and analogies (plays on each add up).
* ☐ **Account switching**: sign in with a **second** Google account (the chooser appears): it starts fresh; switch back with the account list: the first account's progress is still there. **Play as guest** returns to the guest's data.
* ☐ Safari on iPhone: sign-in popup works (third-party storage blocking is the known risk).
* ☐ **Delete my account** on a throwaway account: a receipt appears; signing in again starts empty.

**Report back**: anything that didn't work, with the browser and what the account panel said.
