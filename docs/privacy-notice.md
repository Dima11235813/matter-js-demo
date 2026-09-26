# Lexical Fountain Privacy Notice (DRAFT)

> **Status: draft for review, not published.** Written 2026-09-25 from [docs/research/platform-plan.md](research/platform-plan.md) (Epic 6 · Task 6.2.3). It must be reviewed, ideally by a lawyer, and the placeholders filled before any research data is collected (Stage C) or accounts exist (Stage D). It describes the planned system. Stage A (today) sends nothing anywhere.

## Who we are
Lexical Fountain is a word game about how language models see meaning. Contact: `[contact email]` · Operator: `[name / entity]` · Region: data is stored in the United States (Google Cloud `us-central1`).

## What stays on your device
Everything you do in the game is saved **only in your browser** (IndexedDB):
* your score and settings;
* words you added;
* analogies you played;
* timed-round results;
* a log of your plays.

You can download it all (Privacy & your data → **Export all my data**) and delete it (**Erase this device**) at any time.

## Research sharing (optional, off by default)
If you turn on research sharing, we collect the plays you make **after** you turn it on (and earlier plays only if you choose to include them):
* the words you played from our built-in vocabulary;
* the model's answers and similarity numbers;
* the relation hint and round results;
* 2D/3D and hint mode;
* the app and vocabulary versions.

They are sent under a **random research id** created when you opt in. It is not your device id, not your account, and not your email.

**Never collected for research**: words you added yourself (replaced by `<oov>`), anything you typed or pasted, your IP address or browser details, and your birth year.

Why: to learn which analogies players find and which ones the model gets wrong, and to improve the game. Legal basis: your consent (GDPR Art. 6(1)(a)). You can stop at any time (Privacy & your data → **Stop sharing**), and ask us to delete what was sent (**Delete my research data**, available once research sharing goes live).

## Age
We ask for your birth year before offering research sharing or an account, never before you play, and we keep only an age range, not the year:
* **Under 13**: you can play fully, but nothing leaves your device.
* **13–15**: no research sharing.

## Accounts (planned, optional)
If accounts become available, signing in (Google or an email link, provided by Google Firebase Authentication) lets your game data sync across your devices. Signing in never turns on research sharing. You will be able to export your data and delete your account from the app.

## Processors (planned)
* Google Cloud (API, database, research archive; `us-central1`)
* Google Firebase Authentication (accounts)
* Cloudflare (website hosting, bot protection with Turnstile, anonymous traffic analytics)
* Sentry (error reports, production only)
* Hugging Face and jsDelivr: when you add a new word, your browser downloads the language model from them.

## Retention (proposed, decision D8)
| Data | Kept for |
|---|---|
| Raw research events | 6 months, then kept only in the research archive |
| Research archive | 24 months, then only aggregate counts (never groups smaller than 10 players) |
| Accounts | Until you delete them; inactive accounts are deleted after 24 months, after an email warning |
| Server logs | 30 days |
| Backups | 7 days |

## Your rights
Access, export, correction, deletion, and withdrawal of consent. Most of these are built into the app; for anything else, contact `[contact email]`. We respond within one month. EU/UK residents may also complain to their data protection authority.

## Changes
We version this notice (current research policy: `research-2026-09-draft`). If we change what research sharing collects, we will ask again.
