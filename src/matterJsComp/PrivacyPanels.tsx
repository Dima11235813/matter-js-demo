import React, { useState } from "react";
import { observer } from "mobx-react";
import { stores } from "../stores";
import { downloadPlayLog } from "../services/playground";
import { AgeOutcome, answerAge, answerAgeAndConsent, dismissConsentPrompt, downloadAllData, eraseThisDevice, grantConsent, withdrawConsent } from "../services/privacy";
import { deleteAccount, devSignIn, downloadAccountData, signIn, signOut, syncNow } from "../services/account";
import { canHaveAccount, canShareResearch } from "../game/privacyRules";
import styles from "./PrivacyPanels.module.scss";

/**
 * Consent and data controls (Epic 6 · Features 6.2, 6.3). Honest by design: until the research server
 * exists (Epic 3 · 3.6) nothing is sent, and the copy says so.
 */

const AgeQuestion = ({ onDone, answer = answerAgeAndConsent }: { onDone(message: string): void; answer?: (year: number) => Promise<AgeOutcome> }) => {
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const outcome = await answer(Number(year));
    if (outcome.status === "invalid" || outcome.status === "cooldown") setError(outcome.message);
    else onDone(outcome.message);
  };
  return (
    <form className={styles.AgeForm} onSubmit={submit}>
      <label htmlFor="birth-year">What year were you born?</label>
      <input
        id="birth-year"
        className={styles.YearInput}
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        value={year}
        onChange={e => setYear(e.target.value.replace(/\D/g, ""))}
        placeholder="YYYY"
      />
      <button type="submit" className={styles.Primary} disabled={year.length !== 4}>Continue</button>
      {error && <span className={styles.Error}>{error}</span>}
      <span className={styles.Fine}>Only an age range is kept, never the year.</span>
    </form>
  );
};

/** Shown in the dashboard after a few plays or a finished round; never blocks play. */
export const ConsentPrompt = observer(() => {
  const { privacyStore, menuStore } = stores;
  const [message, setMessage] = useState("");
  if (menuStore.privacyOpen) return null; // the panel has the same controls
  if (message) {
    return (
      <div className={styles.Prompt} data-testid="consent-prompt">
        <span>{message}</span>
        <button type="button" className={styles.Link} onClick={() => setMessage("")}>close</button>
      </div>
    );
  }
  if (!privacyStore.promptVisible) return null;
  return (
    <div className={styles.Prompt} data-testid="consent-prompt">
      <strong>Help us learn which analogies work?</strong>
      <span className={styles.Fine}>
        Share your plays anonymously for research: the words you played and the model's answers, never anything you typed or pasted.
        Nothing is sent until our research server goes live, and you can stop any time.
      </span>
      {privacyStore.askingAge ? (
        <AgeQuestion onDone={setMessage} />
      ) : (
        <div className={styles.Actions}>
          <button type="button" className={styles.Primary} onClick={() => void grantConsent()}>Yes, share my plays</button>
          <button type="button" className={styles.Secondary} onClick={() => void dismissConsentPrompt()}>Not now</button>
        </div>
      )}
    </div>
  );
});

/** The age question before sign-in: accounts are for players 13 and older (Epic 6 · Task 6.2.2.1). */
async function answerForAccount(year: number): Promise<AgeOutcome> {
  const answered = await answerAge(year);
  if (!answered.ok) return answered.outcome;
  if (!canHaveAccount(stores.privacyStore.ageBand)) {
    return { status: "local-only", message: "Accounts are for players 13 and older. Your game stays on this device." };
  }
  await signIn();
  return { status: "shared", message: "" };
}

/** Local test personas (dev builds with a local API only): each is its own account and local database. */
const PERSONAS = ["novice", "intermediate", "expert"];

const PersonaPicker = () => {
  const [name, setName] = useState("");
  return (
    <div className={styles.Actions} data-testid="persona-picker">
      <span className={styles.Fine}>Test personas (local only, no Google):</span>
      {PERSONAS.map(p => (
        <button key={p} type="button" className={styles.Secondary} onClick={() => void devSignIn(p)}>{p}</button>
      ))}
      <form className={styles.AgeForm} onSubmit={e => { e.preventDefault(); if (name.trim()) void devSignIn(name.trim()); }}>
        <input className={styles.YearInput} style={{ width: 110 }} value={name} onChange={e => setName(e.target.value)} placeholder="other name" aria-label="Test persona name" />
        <button type="submit" className={styles.Secondary} disabled={!name.trim()}>Sign in</button>
      </form>
    </div>
  );
};

/** Other accounts used on this device, one click to switch (each has its own local data). */
const AccountSwitcher = observer(() => {
  const { accountStore } = stores;
  const others = accountStore.accounts.filter(a => a.uid !== accountStore.user?.uid);
  if (others.length === 0) return null;
  return (
    <div className={styles.Actions} data-testid="account-switcher">
      <span className={styles.Fine}>Accounts on this device:</span>
      {others.map(a => (
        <button
          key={a.uid}
          type="button"
          className={styles.Secondary}
          onClick={() => void (a.provider === "dev" ? devSignIn(a.label) : signIn())}
          disabled={a.provider === "dev" ? !accountStore.devPersonas : !accountStore.googleAvailable}
          title={a.provider === "google" ? "Sign in with this Google account" : "Local test persona"}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
});

/** Optional sign-in and sync (Epic 3 · Feature 3.8, Epic 6 · Features 6.4, 6.7). Hidden when no sign-in exists. */
const AccountSection = observer(() => {
  const { accountStore, privacyStore } = stores;
  const [askAge, setAskAge] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!accountStore.available) return null;
  const { user, status, message, lastSyncAt, googleAvailable, devPersonas } = accountStore;

  if (!user) {
    const blocked = privacyStore.ageBand !== undefined && !canHaveAccount(privacyStore.ageBand);
    return (
      <div className={styles.Section} data-testid="account-section">
        <div className={styles.Title}>Account</div>
        <p className={styles.Fine}>Sign in to keep your score, words, analogies, and games in sync on all your devices. Optional: the game works fully without it.</p>
        {googleAvailable && (blocked ? (
          <p className={styles.Fine}>Accounts are for players 13 and older. Your game stays on this device.</p>
        ) : askAge ? (
          <AgeQuestion answer={answerForAccount} onDone={setNote} />
        ) : (
          <button type="button" className={styles.Primary} onClick={() => (privacyStore.ageBand ? void signIn() : setAskAge(true))}>Sign in with Google</button>
        ))}
        {devPersonas && <PersonaPicker />}
        <AccountSwitcher />
        {(note || message) && <p className={styles.Fine}>{note || message}</p>}
      </div>
    );
  }

  const statusText = status === "syncing" ? "Syncing…"
    : status === "error" ? message
      : lastSyncAt ? `Synced ${new Date(lastSyncAt).toLocaleTimeString()}${message ? ` · ${message}` : ""}` : "";
  return (
    <div className={styles.Section} data-testid="account-section">
      <div className={styles.Title}>
        Signed in as <strong data-testid="account-user">{user.email ?? user.displayName ?? "you"}</strong>
        {user.provider === "dev" && <span className={styles.Fine}> (test persona)</span>}
      </div>
      <p className={status === "error" ? styles.Error : styles.Fine} data-testid="sync-status">{statusText}</p>
      <div className={styles.Actions}>
        <button type="button" className={styles.Secondary} onClick={() => void syncNow()} disabled={status === "syncing"}>Sync now</button>
        <button type="button" className={styles.Secondary} onClick={() => void signOut()}>Play as guest</button>
        <button type="button" className={styles.Secondary} onClick={() => void downloadAccountData()}>Download account data</button>
      </div>
      <AccountSwitcher />
      {devPersonas && <PersonaPicker />}
      {confirmDelete ? (
        <div className={styles.Actions}>
          <span className={styles.Warning}>Delete your account and everything synced to it? This device keeps its own copy.</span>
          <button type="button" className={styles.Danger} onClick={() => void deleteAccount().then(receipt => { setConfirmDelete(false); setNote(`Account deleted (receipt ${receipt.slice(0, 8)}).`); })}>Delete account</button>
          <button type="button" className={styles.Secondary} onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className={styles.DangerOutline} onClick={() => setConfirmDelete(true)}>Delete my account</button>
      )}
      {note && <p className={styles.Fine}>{note}</p>}
    </div>
  );
});

/** Opened from the menu: research sharing, downloads, and erasing this device. */
export const PrivacyPanel = observer(() => {
  const { menuStore, privacyStore } = stores;
  const [confirmErase, setConfirmErase] = useState(false);
  const [ageMessage, setAgeMessage] = useState("");
  if (!menuStore.privacyOpen) return null;
  const { consent, ageBand } = privacyStore;
  const ageLocked = ageBand !== undefined && !canShareResearch(ageBand);
  return (
    <section className={styles.Panel} aria-label="Privacy and your data" data-testid="privacy-panel">
      <div className={styles.Header}>
        <span>Account, privacy &amp; your data</span>
        <button type="button" className={styles.Close} onClick={() => menuStore.setPrivacyOpen(false)} aria-label="Close privacy" title="Close">×</button>
      </div>

      <AccountSection />

      <div className={styles.Section}>
        <div className={styles.Title}>Research sharing: <strong data-testid="consent-status">{consent ? "on" : "off"}</strong></div>
        <p className={styles.Fine}>
          When on, your plays (words played, the model's answers, scores) will be shared under a random research id that isn't linked to you.
          Player-added words, typed and pasted text, and your IP address are never shared. Nothing is sent until the research server goes live.
        </p>
        {consent ? (
          <button type="button" className={styles.Secondary} onClick={() => void withdrawConsent()}>Stop sharing</button>
        ) : ageLocked ? (
          <p className={styles.Fine}>Your plays stay on this device.</p>
        ) : privacyStore.askingAge ? (
          <AgeQuestion onDone={setAgeMessage} />
        ) : (
          <button type="button" className={styles.Primary} onClick={() => void grantConsent()}>Share my plays</button>
        )}
        {ageMessage && <p className={styles.Fine}>{ageMessage}</p>}
      </div>

      <div className={styles.Section}>
        <div className={styles.Title}>Your data on this device</div>
        <div className={styles.Actions}>
          <button type="button" className={styles.Secondary} onClick={() => void downloadPlayLog()}>Download my play log</button>
          <button type="button" className={styles.Secondary} onClick={() => void downloadAllData()}>Export all my data</button>
        </div>
      </div>

      <div className={styles.Section}>
        {confirmErase ? (
          <div className={styles.Actions}>
            <span className={styles.Warning}>Erase your score, words, analogies, games, and play log from this device? This can't be undone.</span>
            <button type="button" className={styles.Danger} onClick={() => void eraseThisDevice()}>Erase everything</button>
            <button type="button" className={styles.Secondary} onClick={() => setConfirmErase(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className={styles.DangerOutline} onClick={() => setConfirmErase(true)}>Erase this device</button>
        )}
      </div>
    </section>
  );
});
