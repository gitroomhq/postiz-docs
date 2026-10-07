/**
 * Shared plumbing for the docs checks: argument parsing, git diff scoping and
 * reporting.
 *
 * Scoping exists so a pull request is judged on what it changed. Every check
 * still runs over the whole repository, but only findings that land on a line
 * the branch touched can fail the build. Everything else is printed once, as
 * context, and ignored by the exit code.
 */
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

export function parseArgs(argv, root) {
  const args = argv.slice(2);
  const flag = (name) => args.includes(`--${name}`);
  const value = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  return {
    changed: flag('changed'),
    base: value('base') ?? process.env.DOCS_CHECK_BASE ?? 'origin/main',
    files: args.filter((a) => !a.startsWith('--') && a !== value('base')).map((a) => resolve(root, a)),
  };
}

const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Lines the branch added or rewrote, per file, plus the files it deleted.
 * Returns null when scoping was not asked for or git cannot answer, in which
 * case every finding counts.
 */
export function loadScope(root, { changed, base }) {
  if (!changed) return null;

  let from = base;
  try {
    from = git(root, 'merge-base', base, 'HEAD').trim() || base;
  } catch {
    // Shallow clone or unknown ref: fall back to the ref as given.
  }

  let diff;
  let status;
  try {
    diff = git(root, 'diff', '--unified=0', '--no-color', '--no-ext-diff', from);
    status = git(root, 'diff', '--name-status', '--no-renames', from);
  } catch (error) {
    console.error(`cannot diff against ${base}, checking everything instead`);
    console.error(`  ${String(error.message).split('\n')[0]}`);
    return null;
  }

  const added = new Map();
  const deleted = new Set();
  let file = null;

  for (const line of diff.split('\n')) {
    const header = line.match(/^\+\+\+ b\/(.+)$/);
    if (header) {
      file = header[1] === 'dev/null' ? null : header[1];
      if (file && !added.has(file)) added.set(file, new Set());
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/);
    if (!hunk || !file) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let i = 0; i < count; i += 1) added.get(file).add(start + i);
  }

  for (const line of status.split('\n')) {
    const [state, path] = line.split('\t');
    if (state === 'D' && path) deleted.add(path);
  }

  return { from, base, added, deleted, touched: new Set(added.keys()) };
}

export class Report {
  constructor({ root, scope, name }) {
    this.root = root;
    this.scope = scope;
    this.name = name;
    this.findings = [];
    this.notes = [];
    this.checked = 0;
  }

  /**
   * line 0 means "this finding is about the file as a whole", which is in
   * scope whenever the branch touched the file at all.
   */
  /**
   * `also` lists further places the finding belongs to, so a problem reported
   * against docs.json can still count when what the branch touched was the
   * page docs.json points at.
   */
  add(file, line, rule, message, col = 1, also = []) {
    const path = file.startsWith('/') ? relative(this.root, file) : file;
    this.findings.push({ file: path, line, col, rule, message, also });
  }

  note(message) {
    this.notes.push(message);
  }

  inScope({ file, line, also = [] }) {
    if (!this.scope) return true;
    const at = (path, at_) => {
      if (this.scope.deleted.has(path)) return true;
      const lines = this.scope.added.get(path);
      if (!lines) return false;
      return at_ === 0 ? lines.size > 0 : lines.has(at_);
    };
    return at(file, line) || also.some((a) => at(a.file, a.line ?? 0));
  }

  finish() {
    const sorted = this.findings.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col,
    );
    const blocking = sorted.filter((f) => this.inScope(f));
    const existing = sorted.filter((f) => !this.inScope(f));

    const format = (f) =>
      `  ${f.file}:${f.line || 1}:${f.col}  ${f.rule.padEnd(11)} ${f.message}`;

    if (blocking.length) {
      const files = new Set(blocking.map((f) => f.file)).size;
      console.error(`${this.name} failed: ${blocking.length} issues in ${files} of ${this.checked} files\n`);
      blocking.forEach((f) => console.error(format(f)));
      const counts = blocking.reduce((acc, f) => ({ ...acc, [f.rule]: (acc[f.rule] ?? 0) + 1 }), {});
      console.error(`\n${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}: ${n}`).join(', ')}`);
    } else {
      console.log(`${this.name} passed: ${this.checked} files, no issues${this.scope ? ' in this change' : ''}.`);
    }

    if (existing.length) {
      const shown = existing.slice(0, 15);
      console.log(`\n${existing.length} pre-existing issues outside this change, not blocking:`);
      shown.forEach((f) => console.log(format(f)));
      if (existing.length > shown.length) console.log(`  ... and ${existing.length - shown.length} more`);
    }

    this.notes.forEach((n) => console.log(`\n${n}`));

    process.exit(blocking.length ? 1 : 0);
  }
}
