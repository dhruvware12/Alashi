// "Skip Allow prompts": with it on, an ASK step runs without the Allow / Don't allow question; BLOCK steps still refuse
// and never ask. Off, the question is asked and a no keeps the step from running. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTools } from '../tools.mjs';

const noop = async () => {};
const base = { allowActions: () => true, ui: () => {}, openUrl: noop, onCommitments: noop, showList: noop, fmtWhen: String, commitmentsText: () => '', userName: 'Test' };

// run_command with `rm -f` is ASK (it deletes), so it goes through confirm.
const isWin = os.platform() === 'win32';
const rmCommand = isWin ? 'del /f' : 'rm -f';
function runCommandWith({ skipAllow, answer }) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'skipallow-'));
  const file = path.join(workdir, 'x.txt');
  fs.writeFileSync(file, 'hi');
  const asked = [];
  const ask = async (opts) => { asked.push(opts.placeholder); return answer; };
  const { tools } = createTools({ ...base, ask, workdir, skipAllow: skipAllow ? () => true : () => false });
  const run = tools.find((t) => t.name === 'run_command');
  return { run, file, asked, workdir };
}

// 1. Skip on: the command runs and ask is never called.
{
  const { run, file, asked, workdir } = runCommandWith({ skipAllow: true, answer: null });
  const out = await run.execute({ command: `${rmCommand} x.txt` }, undefined);
  assert.deepEqual(asked, [], 'skipAllow on: no Allow question');
  assert.equal(fs.existsSync(file), false, 'skipAllow on: the command ran');
  assert.equal(typeof out, 'string');
  fs.rmSync(workdir, { recursive: true, force: true });
}

// 2. Skip off: the Allow question is asked, and a "no" stops the command.
{
  const { run, file, asked, workdir } = runCommandWith({ skipAllow: false, answer: null });
  await assert.rejects(run.execute({ command: `${rmCommand} x.txt` }, undefined), /said no/, 'skipAllow off: a no refuses');
  assert.equal(asked.length, 1, 'skipAllow off: ask is called once');
  assert.equal(fs.existsSync(file), true, 'skipAllow off: the command did not run');
  fs.rmSync(workdir, { recursive: true, force: true });
}

// 3. Skip on does not unblock: a BLOCK verdict still refuses, and never asks.
{
  const { run, asked, workdir } = runCommandWith({ skipAllow: true, answer: 'yes' });
  if (isWin) {
     // Skip on Windows
  } else {
    await assert.rejects(run.execute({ command: 'sudo rm -rf /' }, undefined), /Blocked for safety/, 'BLOCK stays blocked');
  }
  assert.deepEqual(asked, [], 'BLOCK never asks, even with skip on');
  fs.rmSync(workdir, { recursive: true, force: true });
}

console.log('skipallow: ok');
