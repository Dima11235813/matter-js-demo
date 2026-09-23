import React, { useState } from "react";
import { inject, observer } from "mobx-react";
import { MenuStore, isWordView } from "../stores/MenuStore";
import { GameStore } from "../stores/GameStore";
import { stores as rootStores } from "../stores";
import { submitPlayerWord } from "../services/playground";
import { GameHud, GameOverCard, HintToggle } from "./GamePanels";
import styles from "./AnalogyDashboard.module.scss";

interface AnalogyDashboardProps {
  menuStore?: MenuStore;
  gameStore?: GameStore;
}

const Formula = ({ words }: { words: string[] }) => {
  const [wordA, wordB, wordC] = [0, 1, 2].map(i => words[i] || "?");
  const cls = (w: string) => (w !== "?" ? styles.ActiveWord : styles.EmptyWord);
  return (
    <div className={styles.Formula}>
      <span className={cls(wordA)}>{wordA}</span>
      <span className={styles.Connector}>is to</span>
      <span className={cls(wordB)}>{wordB}</span>
      <span className={styles.Connector}>as</span>
      <span className={cls(wordC)}>{wordC}</span>
      <span className={styles.Connector}>is to</span>
      <span className={styles.EmptyWord}>?</span>
    </div>
  );
};

const StatusLine = observer(({ store }: { store: MenuStore }) => {
  const { engineStatus, engineMessage, corpusStats } = store;
  if (engineStatus !== "ready" || !corpusStats) {
    const cls = engineStatus === "error" ? styles.StatusError : styles.Status;
    return <div className={cls}>{engineMessage || "Loading vocabulary..."}</div>;
  }
  const { baseWords, playerWords, analogies, profanityFilter } = corpusStats;
  return (
    <div className={styles.Status} data-testid="corpus-stats">
      {baseWords.toLocaleString()} words · {playerWords} yours · {analogies} {analogies === 1 ? "analogy" : "analogies"}
      {!profanityFilter && <span className={styles.DevFlag}> · profanity filter OFF (dev)</span>}
    </div>
  );
});

const LastPlayCard = observer(({ store }: { store: MenuStore }) => {
  const { lastPlay } = store;
  if (!lastPlay) return null;
  const { a, b, c, answer, similarity, points, isNewQuestion, alternatives } = lastPlay;
  return (
    <div className={styles.LogCard} data-testid="last-play">
      <div className={styles.LogText}>
        {a} : {b} :: {c} : <strong>{answer}</strong>
        <span className={styles.Points}> +{points}{isNewQuestion ? " new!" : ""}</span>
      </div>
      <div className={styles.Alternatives}>
        {[{ word: answer, similarity }, ...alternatives].map(n => (
          <span key={n.word} className={styles.AltChip} title={`cosine ${n.similarity.toFixed(3)}`}>
            <span className={styles.AltBar} style={{ width: `${Math.max(0, n.similarity) * 100}%` }} />
            {n.word} {n.similarity.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
});

const WordForm = observer(({ store }: { store: MenuStore }) => {
  const [value, setValue] = useState("");
  const disabled = store.engineStatus !== "ready";
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    submitPlayerWord(store, value);
    setValue("");
  };
  return (
    <form className={styles.WordForm} onSubmit={onSubmit}>
      <input
        className={styles.WordInput}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a word to the corpus"
        aria-label="Add a word"
        maxLength={24}
        disabled={disabled}
      />
      <button className={styles.WordButton} type="submit" disabled={disabled}>Drop</button>
      {store.wordInputMessage && <span className={styles.WordMessage}>{store.wordInputMessage}</span>}
    </form>
  );
});

const AnalogyDashboardComponent = (props: AnalogyDashboardProps) => {
  const store = props.menuStore!;
  const gameStore = props.gameStore!;
  if (!isWordView(store.view)) return null;
  const isGame = store.view === "game";
  const score = isGame ? gameStore.game?.score ?? 0 : store.score;

  return (
    <div className={styles.DashboardRoot}>
      <div className={styles.TopRow}>
        <div className={styles.Logo}>
          Lexical Fountain
          <span className={styles.ModeTag}>{isGame ? "Timed" : "Sandbox"}</span>
        </div>
        <div className={styles.TopControls}>
          <HintToggle stores={rootStores} />
          <div className={styles.ScoreCard}>
            <span className={styles.ScoreLabel}>{isGame ? "ROUND" : "SCORE"}</span>
            <span className={styles.ScoreValue}>{score}</span>
          </div>
        </div>
      </div>
      {isGame ? <GameHud gameStore={gameStore} /> : <StatusLine store={store} />}
      <GameOverCard stores={rootStores} />
      <div className={styles.AnalogyRow}>
        <Formula words={store.selectedWordTexts} />
      </div>
      <LastPlayCard store={store} />
      {!isGame && <WordForm store={store} />}
    </div>
  );
};

export const AnalogyDashboard = inject("menuStore", "gameStore")(observer(AnalogyDashboardComponent));
