import React, { useState } from "react";
import { observer } from "mobx-react";
import { stores } from "../stores";
import { downloadPlayLog } from "../services/playground";
import { answerAgeAndConsent, dismissConsentPrompt, downloadAllData, eraseThisDevice, grantConsent, withdrawConsent } from "../services/privacy";
import { canShareResearch } from "../game/privacyRules";
import styles from "./PrivacyPanels.module.scss";

/**
 * Consent and data controls (Epic 6 · Features 6.2, 6.3). Honest by design: until the research server
 * exists (Epic 3 · 3.6) nothing is sent, and the copy says so.
 */

const AgeQuestion = ({ onDone }: { onDone(message: string): void }) => {
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const outcome = await answerAgeAndConsent(Number(year));
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
        <span>Privacy &amp; your data</span>
        <button type="button" className={styles.Close} onClick={() => menuStore.setPrivacyOpen(false)} aria-label="Close privacy" title="Close">×</button>
      </div>

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
