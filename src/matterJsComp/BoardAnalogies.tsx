import React from "react";
import { inject, observer } from "mobx-react";
import { isWordView, MenuStore } from "../stores/MenuStore";
import { downloadPlayLog, focusWords } from "../services/playground";
import { analogyWords } from "../game/boardAnalogies";
import styles from "./BoardAnalogies.module.scss";

interface BoardAnalogiesProps {
  menuStore?: MenuStore;
}

/**
 * Analogies created on the current board, newest first. Each analogy focuses all four of its
 * words (camera fly-to in 3D, pulse in 2D); each word chip focuses that word alone.
 */
const BoardAnalogiesPanel = ({ menuStore }: BoardAnalogiesProps) => {
  const store = menuStore!;
  if (!store.analogiesOpen || !isWordView(store.view)) return null;
  const { boardAnalogies } = store;

  return (
    <section className={styles.Panel} aria-label="Analogies on this board" data-testid="board-analogies">
      <div className={styles.Header}>
        <span>
          Analogies on this board<span className={styles.Count}>{boardAnalogies.length}</span>
        </span>
        <button type="button" className={styles.Close} onClick={() => store.setAnalogiesOpen(false)} aria-label="Close analogies" title="Close">
          ×
        </button>
      </div>
      {boardAnalogies.length === 0 ? (
        <div className={styles.Empty}>Discovery: pick three words and the model answers. Guess: pick four that form an analogy. Plays appear here.</div>
      ) : (
        <ul className={styles.List}>
          {boardAnalogies.map(item => {
            const words = analogyWords(item);
            return (
              <li key={item.id} className={styles.Item}>
                <button type="button" className={styles.Analogy} onClick={() => focusWords(words)} title="Focus on this analogy">
                  {item.a} : {item.b} :: {item.c} → <strong>{item.answer}</strong>
                  <span className={styles.Meta}>
                    +{item.points} · similarity {item.similarity.toFixed(2)}
                  </span>
                </button>
                <div className={styles.Words}>
                  {words.map(word => (
                    <button key={word} type="button" className={styles.Word} onClick={() => focusWords([word])} title={`Focus on "${word}"`}>
                      {word}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.Footer}>
        <button
          type="button"
          className={styles.Download}
          onClick={() => void downloadPlayLog()}
          title="Every analogy you played, with the model's answers, as a JSON file. Stays on this device unless you share it."
        >
          Download my play log
        </button>
      </div>
    </section>
  );
};

export const BoardAnalogies = inject("menuStore")(observer(BoardAnalogiesPanel));
