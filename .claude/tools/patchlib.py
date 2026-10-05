"""Exact-match patch helpers for agent edits (see CLAUDE.md, "Patch scripts").

Why this exists:
- The repo mixes LF and CRLF files; an exact match must normalize line endings on read and restore
  the file's own ending on write.
- Python on Windows opens text in the ANSI code page (cp1252) by default. A patch that read and wrote
  with the default wrote a `·` as an invalid UTF-8 byte (2026-10-03). Always read and write UTF-8.

Usage, from a patch script written with the Write tool (never a shell heredoc):

    import sys; sys.path.insert(0, r"D:\\GDrive\\Dev\\matter-js-demo\\.claude\\tools")
    from patchlib import edit, append
    edit("src/file.ts", "old text", "new text")   # asserts the old text exists, replaces once
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _read(path):
    raw = open(os.path.join(ROOT, path), encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    return raw.replace("\r\n", "\n"), crlf


def _write(path, text, crlf):
    out = text.replace("\n", "\r\n") if crlf else text
    open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="").write(out)


def edit(path, old, new):
    """Replaces the first occurrence of `old` (LF-normalized) and fails loudly if it is missing."""
    text, crlf = _read(path)
    assert old in text, (path, old[:80])
    _write(path, text.replace(old, new, 1), crlf)


def append(path, addition):
    """Appends text after the file's last line, keeping its line endings."""
    text, crlf = _read(path)
    _write(path, text.rstrip("\n") + "\n" + addition, crlf)
