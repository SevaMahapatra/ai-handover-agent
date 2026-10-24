// Frame capture via bundled ffmpeg. Yields JPEG Buffers, 1 frame every N seconds.
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export const WEBCAM = "Integrated Webcam"; // from: ffmpeg -list_devices true -f dshow -i dummy

function inputArgs(source) {
  if (source === "webcam") return ["-f", "dshow", "-i", `video=${WEBCAM}`];
  return ["-re", "-i", source]; // -re: read file at real speed so it behaves like a live feed
}

// source: "webcam" or a path to a video file. realtime=false on files dumps all samples as fast as possible.
export async function* frames(source, everySec = 3, { width = 960, realtime = true } = {}) {
  const args = ["-hide_banner", "-loglevel", "error", ...inputArgs(source)];
  if (!realtime && source !== "webcam") args.splice(args.indexOf("-re"), 1);
  args.push("-vf", `fps=1/${everySec},scale=${width}:-2`, "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "-");

  const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => (err += d));

  let buf = Buffer.alloc(0);
  try {
    for await (const chunk of ff.stdout) {
      buf = Buffer.concat([buf, chunk]);
      // split on JPEG EOI marker FFD9
      let end;
      while ((end = buf.indexOf(Buffer.from([0xff, 0xd9]))) !== -1) {
        const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
        yield buf.subarray(start, end + 2);
        buf = buf.subarray(end + 2);
      }
    }
  } finally {
    ff.kill();
  }
  if (err.trim()) console.error("[ffmpeg]", err.trim());
}

// Grab a single frame (camera warm-up: skip first ~1s of frames which are often dark).
export async function grabOne(source = "webcam") {
  const args = ["-hide_banner", "-loglevel", "error", ...(source === "webcam" ? inputArgs(source) : ["-i", source]),
    ...(source === "webcam" ? ["-ss", "1.5"] : []), "-frames:v", "1", "-vf", "scale=960:-2", "-f", "image2pipe", "-c:v", "mjpeg", "-"];
  const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "inherit"] });
  const parts = [];
  for await (const c of ff.stdout) parts.push(c);
  return Buffer.concat(parts);
}

// CLI: node vision/capture.js <webcam|file> [everySec] [count]
if (import.meta.filename === process.argv[1]) {
  const fs = await import("node:fs");
  const [source = "webcam", every = "3", count = "3"] = process.argv.slice(2);
  fs.mkdirSync("vision/out", { recursive: true });
  let i = 0;
  const t0 = Date.now();
  for await (const jpg of frames(source, Number(every), { realtime: source === "webcam" })) {
    const p = `vision/out/frame_${i}.jpg`;
    fs.writeFileSync(p, jpg);
    console.log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s  ${p}  ${jpg.length} bytes`);
    if (++i >= Number(count)) break;
  }
}
