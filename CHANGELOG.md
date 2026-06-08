# Changelog

All notable changes to SQLI Striker will be documented in this file.

## [0.1.0] — 2026-06-08

### Added
- Initial release — tactical web GUI for sqlmap
- Dual UI modes: Simple (target + preset → execute) and Expert (tabbed full control)
- SSE streaming with real-time output via ReadableStream
- 5 scan presets: STEALTH, STANDARD, AGGRESSIVE, WAF_BYPASS, BLIND_ONLY
- BEUSTQ technique selection (Boolean, Error, Union, Stacked, Time, Query)
- Level (1-5) and Risk (1-3) sliders
- Tamper picker with search and one-click WAF bypass (7 tampers)
- Proxy support: Direct, Single, File List, Tor
- Custom HTTP headers, cookies, POST body
- Advanced tuning: threads, delay, timeout, retries, DBMS override, batch, crawl, forms
- Extra raw args with security deny-list
- Heuristic stdout parser for fingerprint, databases, tables, columns
- Scan manager resilient to HMR reloads
- Graceful SIGTERM → SIGKILL shutdown
- i18n (EN / PT-BR) with 230+ keys and auto-detection
- Terminal cyberpunk aesthetic: Matrix rain, CRT scanlines, grain, glitch
- Boot sequence animation
- Dedicated enumeration page (dbs → tables → columns → dump)
- Result counts and DBMS auto-detection in status strip
- Aria-live screen reader support
- Help drawer with keyboard shortcuts
