import React from "react";
import { inject, observer } from "mobx-react";
import { MenuStore, isWordView } from "../stores/MenuStore";
import { GameStore } from "../stores/GameStore";
import { stores as rootStores } from "../stores";
import { focusWords } from "../services/playground";
import { analogyWords } from "../game/boardAnalogies";
import { relationHintText } from "../game/relationHint";
import { CompactClock, DimensionToggle, GameHud, GameOverCard, HintToggle, LayoutToggle } from "./GamePanels";
import { useDashboardPlacement } from "./useDashboardPlacement";
import { WordEntryForm } from "./WordEntryForm";
import { ConsentPrompt } from "./PrivacyPanels";
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

/** A word in the HUD that focuses the view on it. */
const WordLink = ({ word, strong = false }: { word: string; strong?: boolean }) => (
  <button type="button" className={strong ? styles.WordLinkStrong : styles.WordLink} onClick={() => focusWords([word])} title={`Focus on "${word}"`}>
    {word}
  </button>
);

const LastPlayCard = observer(({ store }: { store: MenuStore }) => {
  const { lastPlay } = store;
  if (!lastPlay) return null;
  const { a, b, c, answer, similarity, points, isNewQuestion, alternatives, hint, verdict, modelAnswer } = lastPlay;
  return (
    <div className={styles.LogCard} data-testid="last-play">
      <div className={styles.LogText}>
        <WordLink word={a} /> : <WordLink word={b} /> :: <WordLink word={c} /> : <WordLink word={answer} strong />
        <span className={points < 0 ? styles.PointsNegative : styles.Points}> {points >= 0 ? "+" : ""}{points}{isNewQuestion && verdict === undefined ? " new!" : ""}</span>
        <button
          type="button"
          className={styles.FocusAll}
          onClick={() => focusWords(analogyWords(lastPlay))}
          aria-label="Focus on this analogy"
          title="Focus on this analogy"
        >
          ⌖
        </button>
      </div>
      {(verdict || hint) && (
        <div className={styles.Verdict} data-testid="play-verdict">
          {verdict === "full" && <span className={styles.VerdictGood}>completes a dealt pair{modelAnswer ? ` (the model's first choice was ${modelAnswer})` : ""} · </span>}
          {verdict === "penalty" && <span className={styles.VerdictBad}>fell back onto your first pair · </span>}
          {verdict === "none" && <span>not one of this round's relation pairs · </span>}
          {hint && <span className={styles.Hint}>{relationHintText(hint, a, b)}</span>}
        </div>
      )}
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

const AnalogyDashboardComponent = (props: AnalogyDashboardProps) => {
  const store = props.menuStore!;
  const gameStore = props.gameStore!;
  const placement = useDashboardPlacement(store.view);
  if (!isWordView(store.view)) return null;
  const isGame = store.view === "game";
  const score = isGame ? gameStore.game?.score ?? 0 : store.score;
  const { collapsed } = placement;

  return (
    <div ref={placement.rootRef} className={collapsed ? styles.DashboardCollapsed : styles.DashboardRoot} style={placement.style}>
      <div className={styles.TopRow}>
        <div className={styles.DragHandle} {...placement.handleProps} title="Drag to move · double-click to reset">
          <span className={styles.Grip} aria-hidden="true">⠿</span>
          <span className={styles.Logo}>Lexical Fountain</span>
          <span className={styles.ModeTag}>{isGame ? "Timed" : "Sandbox"}</span>
        </div>
        <div className={styles.TopControls}>
          {collapsed && isGame && <CompactClock gameStore={gameStore} />}
          <HintToggle stores={rootStores} />
          <DimensionToggle stores={rootStores} />
          <LayoutToggle stores={rootStores} />
          <div className={styles.ScoreCard}>
            <span className={styles.ScoreLabel}>{isGame ? "ROUND" : "SCORE"}</span>
            <span className={styles.ScoreValue}>{score}</span>
          </div>
          <button
            type="button"
            className={styles.CollapseButton}
            onClick={placement.toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand dashboard" : "Minimize dashboard"}
            title={collapsed ? "Expand dashboard" : "Minimize dashboard"}
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
      </div>
      {!collapsed && <DashboardBody store={store} gameStore={gameStore} isGame={isGame} />}
    </div>
  );
};

const DashboardBody = observer(({ store, gameStore, isGame }: { store: MenuStore; gameStore: GameStore; isGame: boolean }) => {
  return (
    <>
      {isGame ? <GameHud gameStore={gameStore} /> : <StatusLine store={store} />}
      <GameOverCard stores={rootStores} />
      <div className={styles.AnalogyRow}>
        <Formula words={store.selectedWordTexts} />
      </div>
      <LastPlayCard store={store} />
      <ConsentPrompt />
      {!isGame && <WordEntryForm store={store} />}
    </>
  );
});

export const AnalogyDashboard = inject("menuStore", "gameStore")(observer(AnalogyDashboardComponent));
