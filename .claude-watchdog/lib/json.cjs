#!/usr/bin/env node
/*
 * json.js — canonical state store helper for the Claude Code Auto-Resume Watchdog.
 *
 * sessions.json is the single source of truth. All mutations go through this
 * helper so writes are atomic (write-temp + rename) and the schema stays
 * consistent. bash never edits the JSON by hand.
 *
 * Usage:
 *   node json.js init
 *   node json.js add <name> <repo> <prompt> <max_resumes> <log>   -> prints session_id (exit 3 if active dup)
 *   node json.js get <name> <field>                               -> prints value ("" if null/missing)
 *   node json.js set <name> <field> <value>                       -> typed set (int/null/string autodetect)
 *   node json.js setstr <name> <field> <value>                    -> force string set
 *   node json.js del <name>
 *   node json.js exists <name>                                    -> exit 0 if present else 1
 *   node json.js names [status]                                   -> newline-separated names (optional status filter)
 *   node json.js list                                             -> human-readable table
 *   node json.js dump                                             -> pretty JSON to stdout
 *   node json.js fmt-epoch <epoch>                                -> local time string
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.WD_SESSIONS_FILE || path.join(__dirname, '..', 'sessions.json');
const SCHEMA_VERSION = 1;

const TERMINAL = new Set(['DONE', 'STOPPED', 'MAX_RESUMES']); // states a name may be replaced from

function load() {
  if (!fs.existsSync(FILE)) return { version: SCHEMA_VERSION, sessions: {} };
  try {
    const obj = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!obj.sessions) obj.sessions = {};
    if (!obj.version) obj.version = SCHEMA_VERSION;
    return obj;
  } catch (e) {
    process.stderr.write(`json.js: corrupt ${FILE}: ${e.message}\n`);
    process.exit(2);
  }
}

function save(obj) {
  const tmp = FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, FILE); // atomic on same filesystem
}

function coerce(v) {
  if (v === 'null' || v === '') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  return v;
}

function fmtEpoch(e) {
  if (!e) return '-';
  return new Date(Number(e) * 1000).toLocaleString();
}

function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case 'init': {
    if (!fs.existsSync(FILE)) save({ version: SCHEMA_VERSION, sessions: {} });
    break;
  }

  case 'add': {
    const [name, repo, prompt, maxResumes, log] = args;
    if (!name || !repo) { process.stderr.write('add: need <name> <repo> <prompt> <max_resumes> <log>\n'); process.exit(1); }
    const db = load();
    const existing = db.sessions[name];
    if (existing && !TERMINAL.has(existing.status)) {
      process.stderr.write(`add: session "${name}" already active (status=${existing.status}); refusing duplicate\n`);
      process.exit(3);
    }
    const sid = crypto.randomUUID();
    const now = new Date().toISOString();
    db.sessions[name] = {
      name,
      session_id: sid,
      repo,
      prompt: prompt || '',
      last_prompt: prompt || '',
      status: 'QUEUED',
      child_pid: null,
      resume_count: 0,
      max_resumes: parseInt(maxResumes, 10) || 5,
      created_at: now,
      last_activity: now,
      reset_at: null,
      wake_at: null,
      backoff_index: 0,
      log: log || '',
      exit_code: null,
      note: ''
    };
    save(db);
    process.stdout.write(sid + '\n');
    break;
  }

  case 'get': {
    const [name, field] = args;
    const db = load();
    const s = db.sessions[name];
    if (!s || !(field in s) || s[field] == null) { process.stdout.write('\n'); break; }
    process.stdout.write(String(s[field]) + '\n');
    break;
  }

  case 'set':
  case 'setstr': {
    const [name, field, ...rest] = args;
    const value = rest.join(' ');
    const db = load();
    const s = db.sessions[name];
    if (!s) { process.stderr.write(`set: no such session "${name}"\n`); process.exit(1); }
    s[field] = cmd === 'setstr' ? value : coerce(value);
    s.last_activity = new Date().toISOString();
    save(db);
    break;
  }

  case 'del': {
    const [name] = args;
    const db = load();
    delete db.sessions[name];
    save(db);
    break;
  }

  case 'exists': {
    const [name] = args;
    const db = load();
    process.exit(db.sessions[name] ? 0 : 1);
    break;
  }

  case 'names': {
    const [status] = args;
    const db = load();
    for (const n of Object.keys(db.sessions)) {
      if (!status || db.sessions[n].status === status) process.stdout.write(n + '\n');
    }
    break;
  }

  case 'list': {
    const db = load();
    const names = Object.keys(db.sessions);
    if (!names.length) { process.stdout.write('(no tracked sessions)\n'); break; }
    process.stdout.write(
      pad('NAME', 20) + pad('STATUS', 14) + pad('RSM', 6) + pad('PID', 8) +
      pad('WAKE/RESET', 22) + 'LAST ACTIVITY\n'
    );
    process.stdout.write('-'.repeat(92) + '\n');
    for (const n of names) {
      const s = db.sessions[n];
      const wake = s.wake_at ? fmtEpoch(s.wake_at) : (s.reset_at ? fmtEpoch(s.reset_at) : '-');
      const la = s.last_activity ? new Date(s.last_activity).toLocaleString() : '-';
      process.stdout.write(
        pad(n, 20) + pad(s.status, 14) +
        pad(`${s.resume_count}/${s.max_resumes}`, 6) +
        pad(s.child_pid || '-', 8) + pad(wake, 22) + la + '\n'
      );
    }
    break;
  }

  case 'dump': {
    process.stdout.write(JSON.stringify(load(), null, 2) + '\n');
    break;
  }

  case 'fmt-epoch': {
    process.stdout.write(fmtEpoch(args[0]) + '\n');
    break;
  }

  default:
    process.stderr.write(`json.js: unknown command "${cmd}"\n`);
    process.exit(1);
}
