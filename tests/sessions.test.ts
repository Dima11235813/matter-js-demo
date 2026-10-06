import { describe, it, expect } from 'vitest';
import { addedWords, defaultSessionName, parsePlayLogFile, parseSessionFile, SavedSession, sessionFile } from '../src/game/sessions';

const session: SavedSession = {
  id: 's1', name: 'pets', savedAt: 1_790_000_000_000, schema: 1, view: 'fountain',
  words: [{ word: 'dog', x: 10, y: 20, color: '#aabbcc' }, { word: 'puppy', x: 30, y: 40 }],
  analogies: [{ a: 'dog', b: 'puppy', c: 'cat', answer: 'kitten', points: 0, similarity: 0.6 }],
};

describe('saved sessions (owner, 2026-10-05)', () => {
  it('round-trips through the downloadable file, without the local id', () => {
    const file = sessionFile(session, new Date('2026-10-05T00:00:00Z'));
    expect(file).not.toHaveProperty('session.id');
    const parsed = parseSessionFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toMatchObject({ ok: true, dropped: 0, value: { name: 'pets', view: 'fountain', words: session.words.map(w => ({ ...w, color: w.color })), analogies: session.analogies } });
  });

  it('refuses files that are not sessions, and drops malformed or hostile entries', () => {
    expect(parseSessionFile({ kind: 'something-else' })).toEqual({ ok: false, error: 'Not a Lexical Fountain session file' });
    const parsed = parseSessionFile({
      kind: 'lexical-fountain-session',
      session: {
        name: 'x'.repeat(500), view: 'game',
        words: [{ word: 'ok', x: 1, y: 2 }, { word: '<script>', x: 1, y: 2 }, { word: 'nan', x: NaN, y: 0 }, { word: 'tint', x: 1, y: 2, color: 'red; background:url(x)' }],
        analogies: [{ a: 'a', b: 'b' }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.words.map(w => w.word)).toEqual(['ok', 'tint']);
    expect(parsed.value.words[1].color).toBeUndefined();
    expect(parsed.value.name).toBe('Uploaded session');
    expect(parsed.value.view).toBe('fountain'); // Guess boards reopen in Discovery
    expect(parsed.dropped).toBe(3);
  });

  it('names a session after its first words', () => {
    expect(defaultSessionName(['dog', 'puppy', 'cat', 'kitten', 'wolf'])).toMatch(/^dog, puppy, cat \+2 · /);
    expect(defaultSessionName([])).toMatch(/^empty board · /);
  });
});

describe('uploading a play log', () => {
  const event = { id: 'e1', type: 'word', schema: 1, at: 5, sessionId: 's', vocabVersion: 'v', context: { view: 'fountain' }, payload: { word: 'Zeitgeist', status: 'added' } };

  it('accepts the downloaded format and lists the words the player had added', () => {
    const parsed = parsePlayLogFile({ kind: 'lexical-fountain-play-log', events: [event, { ...event, id: 'e2', payload: { word: 'dog', status: 'known' } }] });
    expect(parsed).toMatchObject({ ok: true, dropped: 0 });
    if (parsed.ok) expect(addedWords(parsed.value)).toEqual(['zeitgeist']);
  });

  it('refuses other files and drops malformed events', () => {
    expect(parsePlayLogFile({ kind: 'lexical-fountain-session' }).ok).toBe(false);
    const parsed = parsePlayLogFile({ kind: 'lexical-fountain-play-log', events: [event, { ...event, type: 'hack' }, { id: 'x' }] });
    expect(parsed).toMatchObject({ ok: true, dropped: 2 });
  });
});
