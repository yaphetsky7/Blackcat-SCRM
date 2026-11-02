// Upload exactly the current installer over SSH, verify SHA512, then publish on the cloud server.
// Local configuration contains SSH paths only, never the private key or Claude key.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, '.blackcat-deploy.json'), 'utf8'));
if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(config.sshTarget || '')) throw Error('Invalid cloud SSH target');
const identity = String(config.identityFile || '').replace(/%USERPROFILE%/g, process.env.USERPROFILE || '');
if (!path.isAbsolute(identity) || !fs.statSync(identity).isFile()) throw Error('Cloud SSH identity file is missing');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid application version');
const file = 'BlackCat-SCRM-Setup-' + version + '.exe';
const installer = path.join(root, 'dist', file);
if (!fs.existsSync(installer)) throw Error('Build this version first: ' + file);
const ssh = process.platform === 'win32' ? path.join(process.env.WINDIR, 'System32', 'OpenSSH', 'ssh.exe') : 'ssh';
const scp = process.platform === 'win32' ? path.join(process.env.WINDIR, 'System32', 'OpenSSH', 'scp.exe') : 'scp';
const options = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'IdentitiesOnly=yes', '-i', identity];
const stage = '/var/lib/blackcat-server/publish-staging/' + crypto.randomUUID();
function run(executable, args, input) {
  const result = spawnSync(executable, args, { input, stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'], windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Cloud publishing command failed; inspect the release status before retrying');
}
async function main() {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(installer)) hash.update(chunk);
  const expected = hash.digest('base64');
  run(ssh, [...options, config.sshTarget, 'install -d -o blackcat -g blackcat -m 0700 ' + stage]);
  run(scp, ['-q', ...options, installer, config.sshTarget + ':' + stage + '/' + file]);
  run(ssh, [...options, config.sshTarget, 'chown blackcat:blackcat ' + stage + '/' + file + ' && chmod 0600 ' + stage + '/' + file]);
  const job = { stage, file, expected, version, notes: String(process.env.BC_NOTES || '').slice(0, 4000), mandatory: process.env.BC_FORCED === '1' };
  const script = [
    "const fs = require('node:fs'), crypto = require('node:crypto');",
    'const job = ' + JSON.stringify(job) + ';',
    "(async () => {",
    "  const hash = crypto.createHash('sha512');",
    "  for await (const chunk of fs.createReadStream(job.stage + '/' + job.file)) hash.update(chunk);",
    "  if (hash.digest('base64') !== job.expected) throw Error('Installer checksum mismatch');",
    "  const { createUpdates } = require('/opt/blackcat-server/current/server/updates');",
    "  const updates = createUpdates({ dataDir: '/var/lib/blackcat-server', distDir: job.stage });",
    "  const current = updates.release();",
    "  if (current?.version === job.version && current.sha512 !== job.expected) throw Error('This version already has a different installer; use a new version');",
    "  const result = current?.version === job.version ? current : await updates.publish({ notes: job.notes, mandatory: job.mandatory });",
    "  if (result.version !== job.version || result.sha512 !== job.expected) throw Error('Published release mismatch');",
    "  fs.unlinkSync(job.stage + '/' + job.file);",
    "  console.log('Cloud update published: ' + result.version);",
    "})().catch(error => { console.error(error.message); process.exitCode = 1; });"
  ].join('\n');
  run(ssh, [...options, config.sshTarget, 'cd /opt/blackcat-server/current/server && sudo -u blackcat /opt/blackcat-node/bin/node -'], script);
  run(ssh, [...options, config.sshTarget, 'rmdir -- ' + stage]);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
