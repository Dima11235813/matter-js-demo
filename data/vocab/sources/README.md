# Vocabulary sources

| File | Origin | License |
|---|---|---|
| `opensubtitles-en-50k.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) — `content/2018/en/en_50k.txt`, word frequencies from OpenSubtitles 2018 | CC-BY-SA-4.0 (word lists); subtitles data from [opensubtitles.org](http://www.opensubtitles.org/) |

The primary frequency ranking for `scripts/build-vocab.mjs`. The legacy lists in
`src/utils/Dictionary/` (Google 10k, scribd, MIT) fill in web/written vocabulary
that conversational subtitles miss. `Dict3.ts` (dwyl/english-words) is used only as
a spelling sanity filter.
