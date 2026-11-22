[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Iyannn11/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Iyannn11/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast CSV reader — a faster drop-in for csv-reader 1.0.0

Entry for the [make.fun csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
`run(input)` returns exactly what csv-reader 1.0.0 returns for every input
`{text, header}` — `{columns, rows, errors}` — including every broken-row
case (stray CR, quote junk, unterminated quote, short/long rows, empty
lines, CRLF/LF mixes, quoted newlines), but in much less CPU time.

## Files

- `solve.js` — the reader. Dependency-free ES module, `run(input)`.
- `main.ts` — the driver the harness runs: reads `/input/cases.json`,
  answers each case with `run`, writes `/output/answers.json`.
- `package.json` — `{"type": "module"}` so `solve.js` loads as an ES module.

## How it stays fast

- One left-to-right pass; an unquoted field is found with two `indexOf`
  calls (next comma, next LF) and one `slice`, instead of a
  character-at-a-time loop with string concatenation.
- Every CR position is collected once up front (one C++ scan), so a lone
  CR inside a field is found without an unbounded search, and CRLF line
  ends are recognised in O(1).
- A record with no quoted field and no stray CR is split in one C++
  `split(',')` call instead of a field-by-field scan.
- A quoted field is found with `indexOf('"')` hops over doubled quotes,
  and its span is sliced as-is on the common path (no quote doubling, no
  line break); only line breaks inside a quoted span are processed group
  by group.
- Everything is one function with plain locals: no per-field call, no
  per-field result object. Pure per call, nothing cached between cases.

## Verified locally (practice set + fuzzing)

- Practice set: 6/6 cases identical to csv-reader 1.0.0's expected answers.
- ~46,000 hand-built and randomly generated broken-CSV inputs: 0
  mismatches against csv-reader 1.0.0 (black-box comparison).
- Fresh generator-drawn sets (the kit's own generator, new seeds): 6/6
  identical on each set.
- Speed on the practice set (this machine, interleaved A/B rounds):
  ~115–125 ms vs ~520–610 ms for the house baseline — about 4.6–5.0x
  faster. (The house's own figures for the public tools: d3-dsv 0.73 s
  vs csv-reader 1.38 s, about 1.9x, on their box.)
