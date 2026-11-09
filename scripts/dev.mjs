// Runs the web dev server and the Save_API together as one command (`npm run dev:all`).
// Spawns both workspace `dev` scripts, prefixes their output, and tears both down on exit.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const procs = [
  { name: 'web', color: '\x1b[36m', workspace: '@hr/web' },
  { name: 'api', color: '\x1b[35m', workspace: '@hr/server' },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

function prefix(name, color, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) process.stdout.write(`${color}[${name}]${reset} ${line}\n`);
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  // Give children a moment to exit, then force quit the launcher.
  setTimeout(() => process.exit(code ?? 0), 500);
}

for (const { name, color, workspace } of procs) {
  // shell:true is required on Windows to spawn npm.cmd (a batch file); with it, pass the
  // command as one string so the shell parses the arguments.
  const child = spawn(`${npm} run dev --workspace ${workspace}`, { stdio: ['inherit', 'pipe', 'pipe'], shell: true });
  children.push(child);
  child.stdout.on('data', (c) => prefix(name, color, c));
  child.stderr.on('data', (c) => prefix(name, color, c));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stdout.write(`${color}[${name}]${reset} exited (code ${code ?? 0}); stopping the others.\n`);
      shutdown(code ?? 0);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
