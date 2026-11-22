// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01-run-20261121).
//
// Written from the competition spec (RULES.txt): one left-to-right pass over the
// text, indexOf-driven field scanning, minimal allocation. Returns exactly what
// csv-reader 1.0.0 returns for every input: {columns, rows, errors}.
//
// How it stays fast:
// - An unquoted field is found with two indexOf calls (next comma, next LF) and
//   one slice, instead of a character-at-a-time loop with string concatenation.
// - Every CR position is collected once up front (one C++ scan), so a lone CR
//   inside a field is found without an unbounded search, and CRLF line ends
//   are recognised in O(1).
// - A quoted field is found with indexOf('"') hops over doubled quotes, and its
//   span is sliced as-is on the common path (no quote doubling, no line break).
// - A record with no quoted field and no stray CR is split in one C++
//   split(',') call instead of a field-by-field scan.
// - Line breaks inside a quoted span are the only part processed group by
//   group, and they are rare.
// - Everything is one function with plain locals: no per-field call, no
//   per-field result object.

const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Every CR position, in order (one C++ scan). A CR outside quotes is either
  // the first half of a CRLF line break or a stray CR to drop; a CR inside
  // quotes becomes LF. Knowing where they are keeps the fast paths bounded.
  const crs = [];
  let cr = text.indexOf('\r');
  while (cr !== -1) {
    crs.push(cr);
    cr = text.indexOf('\r', cr + 1);
  }
  let crIdx = 0;

  // The record being read: the line it starts on and the index in rows it
  // takes (null for the header). Every error of the record carries these.
  let recordLine = 1;
  let recordRow = null;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    let fields = null;
    // Fast path: a record with no quoted field and no stray CR. Its fields
    // are one C++ split of the line instead of a field-by-field scan.
    // (A line with a quote or a stray CR falls through to the slow path.)
    {
      const mn = text.indexOf('\n', pos);
      const segEnd = mn === -1 ? len : mn;
      const qpos = text.indexOf('"', pos);
      if (qpos === -1 || qpos >= segEnd) {
        while (crIdx < crs.length && crs[crIdx] < pos) crIdx++;
        const c0 = crIdx < crs.length ? crs[crIdx] : -1;
        if (mn === -1) {
          if (c0 === -1) {
            fields = text.slice(pos, len).split(',');
            pos = len;
          }
        } else if (c0 === -1 || c0 >= mn) {
          fields = text.slice(pos, mn).split(',');
          pos = mn + 1;
          line++;
        } else if (c0 === mn - 1) {
          // Exactly one CR, right before the LF: a CRLF line end.
          fields = text.slice(pos, mn - 1).split(',');
          pos = mn + 1;
          line++;
          crIdx++;
        }
      }
    }
    if (fields === null) {
      fields = [];
    let fval;
    let fend;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      // The unquoted scan below runs with `prefix` already in the value:
      // '' for a plain field, the quoted value for junk after a closing
      // quote, '"' for a quote that never closes. `junkCheck` records
      // quote_junk when that scan keeps any character.
      let prefix = '';
      let junkCheck = false;
      let done = false;
      if (quoted) {
        const open = pos;
        const openLine = line;
        // The closing quote: the next '"' that is not doubled.
        let q = text.indexOf('"', pos + 1);
        let doubled = false;
        while (q !== -1 && text.charCodeAt(q + 1) === 34) {
          doubled = true;
          q = text.indexOf('"', q + 2);
        }
        if (q === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          line = openLine;
          while (crIdx > 0 && crs[crIdx - 1] >= pos) crIdx--;
          prefix = '"';
        } else {
          // The span between the quotes. On the common path it holds no
          // doubled quote and no line break, so it is the value as it stands.
          let value;
          while (crIdx < crs.length && crs[crIdx] < open + 1) crIdx++;
          const crIn = crIdx < crs.length && crs[crIdx] < q;
          const nlIn = text.indexOf('\n', open + 1);
          const hasNl = nlIn !== -1 && nlIn < q;
          if (!doubled && !crIn && !hasNl) {
            value = text.slice(open + 1, q);
          } else if (doubled && !crIn && !hasNl) {
            value = text.slice(open + 1, q).replaceAll('""', '"');
          } else {
            // Line breaks and/or doubled quotes inside: walk the span break
            // by break, turning each CRLF or lone CR into one LF and each
            // "" into ".
            let v = '';
            let p = open + 1;
            while (p < q) {
              const dq = text.indexOf('"', p);
              const dqEff = dq !== -1 && dq < q ? dq : -1;
              const nn = text.indexOf('\n', p);
              const nnEff = nn !== -1 && nn < q ? nn : -1;
              while (crIdx < crs.length && crs[crIdx] < p) crIdx++;
              const cc = crIdx < crs.length && crs[crIdx] < q ? crs[crIdx] : -1;
              let m = -1;
              if (dqEff !== -1) m = dqEff;
              if (nnEff !== -1 && (m === -1 || nnEff < m)) m = nnEff;
              if (cc !== -1 && (m === -1 || cc < m)) m = cc;
              if (m === -1) {
                v += text.slice(p, q);
                break;
              }
              if (m === dqEff) {
                v += text.slice(p, m);
                v += '"';
                p = m + 2;
              } else if (m === nnEff) {
                v += text.slice(p, m);
                v += '\n';
                line++;
                p = m + 1;
              } else {
                v += text.slice(p, m);
                v += '\n';
                line++;
                p = m + 1;
                if (text.charCodeAt(p) === 10) p++;
                crIdx++;
              }
            }
            value = v;
          }
          pos = q + 1;
          if (pos >= len) {
            fval = value;
            fend = END;
            done = true;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos++;
              fval = value;
              fend = COMMA;
              done = true;
            } else if (c === 10) {
              pos++;
              line++;
              fval = value;
              fend = BREAK;
              done = true;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line++;
              fval = value;
              fend = BREAK;
              done = true;
            } else {
              // What follows the closing quote is appended as it stands.
              prefix = value;
              junkCheck = true;
            }
          }
        }
      }
      if (!done) {
        // Unquoted scan from pos, with `prefix` already in the value.
        // `added` counts the characters this scan keeps (not the prefix).
        let value = prefix;
        let added = 0;
        let ended;
        for (;;) {
          const mc = text.indexOf(',', pos);
          const mn = text.indexOf('\n', pos);
          const m = mc === -1 ? mn : mn === -1 ? mc : mc < mn ? mc : mn;
          const mEff = m === -1 ? len : m;
          while (crIdx < crs.length && crs[crIdx] < pos) crIdx++;
          const cr0 = crIdx < crs.length ? crs[crIdx] : -1;
          if (cr0 !== -1 && cr0 < mEff) {
            if (text.charCodeAt(cr0 + 1) === 10) {
              // CRLF: the field ends at the line break.
              value += text.slice(pos, cr0);
              added += cr0 - pos;
              pos = cr0 + 2;
              line++;
              crIdx++;
              ended = BREAK;
              break;
            }
            // A lone CR: drop it, record it, and keep reading the field.
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            value += text.slice(pos, cr0);
            added += cr0 - pos;
            pos = cr0 + 1;
            crIdx++;
            continue;
          }
          if (m === -1) {
            value += text.slice(pos);
            added += len - pos;
            pos = len;
            ended = END;
          } else if (m === mc) {
            value += text.slice(pos, m);
            added += m - pos;
            pos = m + 1;
            ended = COMMA;
          } else {
            value += text.slice(pos, m);
            added += m - pos;
            pos = m + 1;
            line++;
            ended = BREAK;
          }
          break;
        }
        if (junkCheck && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
        fval = value;
        fend = ended;
      }
      fields.push(fval);
    } while (fend === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }
  return { columns: header ? columns ?? [] : null, rows, errors };
}
