import React, { useEffect, useRef, useState } from "react";
import { inject, observer } from "mobx-react";
import { MenuStore } from "../stores/MenuStore";
import { stores as rootStores } from "../stores";
import {
    canSaveSession, deleteSession, downloadSession, loadSession, refreshSessions, saveCurrentSession, uploadPlayLogFile, uploadSessionFile,
} from "../services/sessions";
import styles from "./BoardAnalogies.module.scss";

/**
 * Saved sessions (owner, 2026-10-05): save the board, reload it later on this device, download it as a
 * file, and upload session files or a downloaded play log.
 */
const SessionsPanelComponent = ({ menuStore }: { menuStore?: MenuStore }) => {
    const store = menuStore!;
    const [name, setName] = useState("");
    const sessionInput = useRef<HTMLInputElement>(null);
    const logInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (store.sessionsOpen) void refreshSessions(rootStores);
    }, [store.sessionsOpen]);
    if (!store.sessionsOpen) return null;
    const canSave = canSaveSession(store.view) && store.engineStatus === "ready";
    const onFile = (upload: (f: File) => Promise<void>) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
    };

    return (
        <section className={styles.Panel} aria-label="Saved sessions" data-testid="sessions-panel">
            <div className={styles.Header}>
                <span>Saved sessions<span className={styles.Count}>{store.sessions.length}</span></span>
                <button type="button" className={styles.Close} onClick={() => store.setSessionsOpen(false)} aria-label="Close sessions" title="Close">×</button>
            </div>
            <form
                className={styles.Footer}
                onSubmit={event => { event.preventDefault(); void saveCurrentSession(rootStores, name).then(() => setName("")); }}
            >
                <input
                    aria-label="Session name"
                    placeholder="Name (optional)"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    maxLength={120}
                    style={{ flex: 1, minWidth: 0, font: "inherit", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-raised)", color: "var(--text)" }}
                />
                <button type="submit" className={styles.Download} disabled={!canSave} title="Save the words on the board, where they are, and its analogies">Save this board</button>
            </form>
            {store.sessionsMessage && <div className={styles.Empty} data-testid="sessions-message">{store.sessionsMessage}</div>}
            {store.sessions.length === 0 ? (
                <div className={styles.Empty}>No saved sessions yet. Saved boards stay on this device (in this account).</div>
            ) : (
                <ul className={styles.List}>
                    {store.sessions.map(session => (
                        <li key={session.id} className={styles.Item} data-testid="saved-session">
                            <div className={styles.Analogy}>
                                {session.name}
                                <span className={styles.Meta}>
                                    {session.letters ? `${session.letters.length} letters` : `${session.words.length} words`} · {session.analogies.length} analogies · {new Date(session.savedAt).toLocaleString()}
                                </span>
                            </div>
                            <div className={styles.Words}>
                                <button type="button" className={styles.Word} onClick={() => void loadSession(rootStores, session.id)}>Load</button>
                                <button type="button" className={styles.Word} onClick={() => void downloadSession(session.id)}>Download</button>
                                <button type="button" className={styles.Word} onClick={() => void deleteSession(rootStores, session.id)} aria-label={`Delete ${session.name}`}>Delete</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div className={styles.Footer}>
                <button type="button" className={styles.Download} onClick={() => sessionInput.current?.click()} title="Add a downloaded session file to your saved sessions">Upload a session</button>
                <button type="button" className={styles.Download} onClick={() => logInput.current?.click()} title="Merge a downloaded play log into this device's log; words you had added come back">Upload a play log</button>
                <input ref={sessionInput} type="file" accept="application/json,.json" hidden data-testid="session-file" onChange={onFile(f => uploadSessionFile(rootStores, f))} />
                <input ref={logInput} type="file" accept="application/json,.json" hidden data-testid="play-log-file" onChange={onFile(f => uploadPlayLogFile(rootStores, f))} />
            </div>
        </section>
    );
};

export const SessionsPanel = inject("menuStore")(observer(SessionsPanelComponent));
