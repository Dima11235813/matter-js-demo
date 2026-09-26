import React, { useState } from "react";
import { observer } from "mobx-react";
import { stores } from "../stores";
import { downloadPlayLog } from "../services/playground";
import { AgeOutcome, answerAge, answerAgeAndConsent, dismissConsentPrompt, downloadAllData, eraseThisDevice, grantConsent, withdrawConsent } from "../services/privacy";
import { deleteAccount, downloadAccountData, signIn, signOut, syncNow } from "../services/account";
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

/** Optional Google sign-in and sync (Epic 3 · Feature 3.8, Epic 6 · Feature 6.4). Hidden when not configured. */
const AccountSection = observer(() => {
  const { accountStore, privacyStore } = stores;
  const [askAge, setAskAge] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!accountStore.available) return null;
  const { user, status, message, lastSyncAt } = accountStore;

  if (!user) {
    const blocked = privacyStore.ageBand !== undefined && !canHaveAccount(privacyStore.ageBand);
    return (
      <div className={styles.Section} data-testid="account-section">
        <div className={styles.Title}>Account</div>
        <p className={styles.Fine}>Sign in to keep your score, words, analogies, and games in sync on all your devices. Optional: the game works fully without it.</p>
        {blocked ? (
          <p className={styles.Fine}>Accounts are for players 13 and older. Your game stays on this device.</p>
        ) : askAge ? (
          <AgeQuestion answer={answerForAccount} onDone={setNote} />
        ) : (
          <button type="button" className={styles.Primary} onClick={() => (privacyStore.ageBand ? void signIn() : setAskAge(true))}>Sign in with Google</button>
        )}
        {(note || message) && <p className={styles.Fine}>{note || message}</p>}
      </div>
    );
  }

  const statusText = status === "syncing" ? "Syncing…"
    : status === "error" ? message
      : lastSyncAt ? `Synced ${new Date(lastSyncAt).toLocaleTimeString()}${message ? ` · ${message}` : ""}` : "";
  return (
    <div className={styles.Section} data-testid="account-section">
      <div className={styles.Title}>Signed in as <strong data-testid="account-user">{user.email ?? user.displayName ?? "you"}</strong></div>
      <p className={status === "error" ? styles.Error : styles.Fine} data-testid="sync-status">{statusText}</p>
      <div className={styles.Actions}>
        <button type="button" className={styles.Secondary} onClick={() => void syncNow()} disabled={status === "syncing"}>Sync now</button>
        <button type="button" className={styles.Secondary} onClick={() => void signOut()}>Sign out</button>
        <button type="button" className={styles.Secondary} onClick={() => void downloadAccountData()}>Download account data</button>
      </div>
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
