#!/usr/bin/env python3
"""
Run both leak gates locally, the way CI does.

There are two gates and they do not agree with each other:

  check-public.py     scans six files in the working tree
  check-history.yml   scans every file in every commit, across all refs

A green tree gate therefore proves nothing about the history gate, which is the one
that stays red after a name has been committed and later removed again. That is not
hypothetical: the commit titled "say the path, not the product name" removed the name
and is still flagged, because `git log -S` counts any change in occurrences, in either
direction.

The pattern list is read out of the workflows rather than restated here, so this file
never contains the names it looks for - the same reason the history workflow carries
them base64-encoded.

Usage:  python3 .github/workflows/check-leaks.py
Exit 0 when both gates are clean.
"""
import base64
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC_GATE = ROOT / ".github" / "workflows" / "check-public.py"
HISTORY_GATE = ROOT / ".github" / "workflows" / "check-history.yml"

# the history workflow excludes itself and the tree gate, because the tree gate has to
# list the names to do its job and would otherwise flag its own tooling
HISTORY_EXCLUDES = (
    ":(exclude).github/workflows/check-public.py",
    ":(exclude).github/workflows/check-history.yml",
)


def history_patterns():
    """The decoded pattern list the history workflow feeds to git log -S."""
    text = HISTORY_GATE.read_text(encoding="utf-8")
    m = re.search(r"printf '%s\\n' ([^|]+)\|", text)
    if not m:
        raise SystemExit("could not find the base64 list in check-history.yml")
    return [base64.b64decode(tok).decode("utf-8") for tok in m.group(1).split()]


def run(cmd):
    return subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)


def main():
    failed = False

    r = run([sys.executable, str(PUBLIC_GATE)])
    if r.returncode == 0:
        print("tree gate    ok:", r.stdout.strip())
    else:
        failed = True
        print("tree gate    FAILED")
        print((r.stdout + r.stderr).strip())

    for pat in history_patterns():
        r = run(["git", "log", "--all", "-i", "-S", pat, "--oneline", "--", ".", *HISTORY_EXCLUDES])
        hits = [line for line in r.stdout.splitlines() if line.strip()]
        if hits:
            failed = True
            print("history      leak: %r in %d commit(s)" % (pat, len(hits)))
            for line in hits[:6]:
                print("                 ", line)
        else:
            print("history      ok:", pat)

    if failed:
        print()
        print("A clean working tree does not mean a clean history. Anything committed and")
        print("then removed still counts, and --all includes tags. The only fix is to")
        print("rewrite the history, or do not publish the name.")
        return 1

    print("both gates clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
