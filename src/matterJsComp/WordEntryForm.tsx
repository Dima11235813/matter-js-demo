import React, { useDeferredValue, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { MenuStore } from "../stores/MenuStore";
import { stores as rootStores } from "../stores";
import { importKeywords, playExpression, submitPlayerWord } from "../services/playground";
import { semanticEngine } from "../services/semanticEngine";
import { formatExpression, parseEntry, WordEntry } from "../game/wordEntry";
import { Keyword } from "../game/keywords";
import styles from "./WordEntryForm.module.scss";

const INITIAL_KEYWORDS = 12;
const MORE_KEYWORDS = 6;
const MAX_TEXT_LENGTH = 50000;

/**
 * The dashboard's word box (Epic 2 · Features 2.8, 2.9). One input, three behaviours:
 * a word drops onto the board; `king - man + woman` plays the analogy (live preview while typing);
 * a pasted text shows its keywords as removable chips, and "Drop N" puts them on the board.
 */
export const WordEntryForm = observer(({ store }: { store: MenuStore }) => {
  const [value, setValue] = useState("");
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(INITIAL_KEYWORDS);
  const deferred = useDeferredValue(value);
  const ready = store.engineStatus === "ready";
  const entry = useMemo(() => parseEntry(deferred), [deferred]);
  const keywords = useMemo(() => (ready && entry.kind === "text" ? semanticEngine.keywords(entry.text) : undefined), [entry, ready]);
  const candidates = keywords ? keywords.ranked.filter(k => !removed.has(k.word)) : [];
  const visible = candidates.slice(0, shown);

  const reset = () => {
    setValue("");
    setRemoved(new Set());
    setShown(INITIAL_KEYWORDS);
  };
  const onChange = (next: string) => {
    setValue(next);
    if (store.wordInputMessage) store.setWordInputMessage(""); // the last result no longer applies
    if (parseEntry(next).kind !== "text") {
      setRemoved(new Set());
      setShown(INITIAL_KEYWORDS);
    }
  };
  const submit = () => {
    const current = parseEntry(value);
    switch (current.kind) {
      case "word":
        void submitPlayerWord(store, current.word);
        break;
      case "expression":
        void playExpression(rootStores, current.terms);
        break;
      case "text":
        if (visible.length === 0) return;
        void importKeywords(rootStores, visible);
        break;
      case "error":
        store.setWordInputMessage(current.message);
        return;
      default:
        return;
    }
    reset();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && value) {
      reset();
    }
  };

  const isText = entry.kind === "text";
  const label = entry.kind === "expression" ? "Play" : isText ? `Drop ${visible.length}` : "Drop";
  return (
    <form className={styles.Form} onSubmit={e => { e.preventDefault(); submit(); }}>
      <textarea
        className={isText ? styles.InputExpanded : styles.Input}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add a word, try king - man + woman, or paste a text"
        aria-label="Add a word"
        title="A word drops onto the board · + and − play analogies (king - man + woman) · pasted text drops its keywords · Shift+Enter for a new line"
        rows={isText ? 4 : 1}
        maxLength={MAX_TEXT_LENGTH}
        disabled={!ready}
      />
      <button className={styles.Button} type="submit" disabled={!ready || (isText && visible.length === 0)}>{label}</button>
      {ready && entry.kind === "expression" && <ExpressionPreview entry={entry} />}
      {entry.kind === "error" && deferred.trim() && <span className={styles.Hint}>{entry.message}</span>}
      {keywords && (
        <KeywordPreview
          visible={visible}
          total={candidates.length}
          distinct={keywords.distinctWords}
          onRemove={word => setRemoved(new Set([...removed, word]))}
          onMore={() => setShown(shown + MORE_KEYWORDS)}
          onCancel={reset}
        />
      )}
      {store.wordInputMessage && <span className={styles.Message} data-testid="word-message">{store.wordInputMessage}</span>}
    </form>
  );
});

/** Live result while typing an expression; nothing is recorded until Play. */
const ExpressionPreview = ({ entry }: { entry: Extract<WordEntry, { kind: "expression" }> }) => {
  const outcome = useMemo(() => semanticEngine.evaluateExpression(entry.terms), [entry]);
  const expression = (
    <span className={styles.Terms}>
      {entry.terms.map((t, i) => (
        <span key={t.word} className={t.sign === 1 ? styles.PlusTerm : styles.MinusTerm}>
          {i > 0 || t.sign === -1 ? (t.sign === 1 ? "+ " : "− ") : ""}{t.word}
        </span>
      ))}
    </span>
  );
  let result: React.ReactNode;
  switch (outcome.kind) {
    case "analogy":
      result = <>= <strong>{outcome.result.answer}</strong> {outcome.result.similarity.toFixed(2)} <span className={styles.Muted}>· {outcome.result.a} : {outcome.result.b} :: {outcome.result.c}</span></>;
      break;
    case "sum":
      result = <>≈ <strong>{outcome.neighbors[0].word}</strong> {outcome.neighbors[0].similarity.toFixed(2)}</>;
      break;
    case "unknown":
      result = <span className={styles.Muted}>new: {outcome.words.join(", ")} (embedded on Play)</span>;
      break;
    case "blocked":
      result = <span className={styles.Muted}>blocked: {outcome.words.join(", ")}</span>;
      break;
    default:
      result = <span className={styles.Muted}>no answer</span>;
  }
  return (
    <div className={styles.Preview} data-testid="expression-preview" aria-live="polite" title={formatExpression(entry.terms)}>
      {expression} {result}
    </div>
  );
};

interface KeywordPreviewProps {
  visible: readonly Keyword[];
  total: number;
  distinct: number;
  onRemove(word: string): void;
  onMore(): void;
  onCancel(): void;
}

const KeywordPreview = ({ visible, total, distinct, onRemove, onMore, onCancel }: KeywordPreviewProps) => (
  <div className={styles.Keywords} data-testid="keyword-preview">
    <div className={styles.KeywordsHeader}>
      <span>{visible.length} of {distinct} distinct words</span>
      {total > visible.length && <button type="button" className={styles.Link} onClick={onMore}>+ more</button>}
      <button type="button" className={styles.Link} onClick={onCancel}>clear</button>
    </div>
    {visible.length === 0 ? (
      <span className={styles.Muted}>No keywords found: try a longer text.</span>
    ) : (
      <div className={styles.Chips}>
        {visible.map(k => (
          <button
            key={k.word}
            type="button"
            className={k.isNew ? styles.ChipNew : styles.Chip}
            onClick={() => onRemove(k.word)}
            title={`${k.count}× in the text${k.isNew ? " · new to the corpus" : ""} · click to remove`}
          >
            {k.word}{k.isNew ? " ✦" : ""} <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    )}
  </div>
);
