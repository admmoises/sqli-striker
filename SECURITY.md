# Security Policy

## Reporting a Vulnerability

SQLI Striker is a penetration testing tool — it is designed to be used **offensively** against targets you have explicit permission to test.

If you discover a vulnerability in SQLI Striker itself (not in a scanned target), please:

1. **Do not open a public issue.**  
   Email [th3w6rst@proton.me](mailto:th3w6rst@proton.me) with details.

2. Include:
   - Affected version
   - Steps to reproduce
   - Impact assessment

We aim to respond within 72 hours and publish fixes within 14 days.

## Safe Usage

- Only scan targets you **own** or have **explicit written authorization** to test
- Be aware of the `--risk=3` flag — it can modify or destroy data
- The `--threads` option is capped at 10 in the UI to prevent accidental DoS
- Extra args are filtered through a deny-list blocking `--eval`, `--os-*`, `--file-*`, `-r`, `--load-cookies`
- Child process environment is stripped to PATH, HOME, LANG, LC_ALL, TMPDIR, TERM only — no server secrets leak

## Scope

This security policy covers the SQLI Striker application code. The underlying [sqlmap](https://github.com/sqlmapproject/sqlmap) tool has its own security policy.
