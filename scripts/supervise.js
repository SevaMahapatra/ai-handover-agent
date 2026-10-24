// Laptop "deployment" for tonight: node scripts/supervise.js
// - keeps Windows awake while it runs (SetThreadExecutionState; no power settings changed, reverts when this exits)
// - restarts handover/listen.js if it crashes (3s backoff), appends all output to state/listen.log
// - refuses to start if another supervisor is already running (two listeners would both answer every Slack event)
import { spawn } from "node:child_process";
import fs from "node:fs";

const LOCK = "state/supervisor.lock";
const LOG = "state/listen.log";
fs.mkdirSync("state", { recursive: true });

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
if (fs.existsSync(LOCK)) {
  const pid = Number(fs.readFileSync(LOCK, "utf8"));
  if (alive(pid)) {
    console.error(`ERROR: already running (pid ${pid}). Stop it first: taskkill /PID ${pid} /T /F`);
    process.exit(1);
  }
}
fs.writeFileSync(LOCK, String(process.pid));

const log = fs.createWriteStream(LOG, { flags: "a" });
const out = (line) => { process.stdout.write(line); log.write(line); };
const stamp = (msg) => out(`[${new Date().toISOString()}] supervisor: ${msg}\n`);

// ES_CONTINUOUS | ES_SYSTEM_REQUIRED: system stays awake while this PowerShell child lives. Closing the lid can still sleep.
let awake = null;
if (process.platform === "win32") {
  const ps = `Add-Type -Namespace W -Name P -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'; $r = [W.P]::SetThreadExecutionState([uint32]2147483649); Write-Output ('keep-awake result 0x{0:X}' -f $r); while ($true) { Start-Sleep 60 }`;
  // 0x80000001 written as decimal: Windows PowerShell 5.1 parses the hex literal as a negative Int32 and the call fails.
  awake = spawn("powershell", ["-NoProfile", "-Command", ps], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  awake.stdout.on("data", (d) => stamp(`${String(d).trim()} (pid ${awake.pid}; non-zero = PC stays awake)`));
  awake.stderr.on("data", (d) => stamp(`keep-awake FAILED: ${String(d).trim().split("\n")[0]}`));
}

let child = null;
let stopping = false;
function start() {
  child = spawn(process.execPath, ["handover/listen.js"], { stdio: ["ignore", "pipe", "pipe"] });
  stamp(`listener started (pid ${child.pid})`);
  child.stdout.on("data", (d) => out(String(d)));
  child.stderr.on("data", (d) => out(String(d)));
  child.on("exit", (code, sig) => {
    if (stopping) return;
    stamp(`listener exited (code ${code}${sig ? `, ${sig}` : ""}); restarting in 3s`);
    setTimeout(start, 3000);
  });
}

function stop() {
  stopping = true;
  stamp("stopping");
  child?.kill();
  awake?.kill();
  try { fs.unlinkSync(LOCK); } catch {}
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
start();
