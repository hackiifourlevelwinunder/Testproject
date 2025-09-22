const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

let engineRunning = false;

function randDigit() {
  return crypto.randomInt(0, 10);
}

function isoUTC(date) {
  return date.toISOString().replace(".000", "");
}

class MinuteEngine {
  constructor() {
    this.samplesPlanned = 25;
    this.previewOffset = 35;
    this.currentMinuteStart = null;
    this.samples = [];
  }

  start() {
    if (engineRunning) return;
    engineRunning = true;
    this.scheduleNextMinute();
  }

  scheduleNextMinute() {
    const now = new Date();
    const nextMinute = new Date(now);
    nextMinute.setUTCSeconds(0, 0);
    if (now.getUTCSeconds() !== 0) {
      nextMinute.setUTCMinutes(nextMinute.getUTCMinutes() + 1);
    }
    const delay = nextMinute - now;
    setTimeout(() => this.runMinute(nextMinute), delay + 20);
  }

  runMinute(minuteStart) {
    this.currentMinuteStart = minuteStart;
    this.samples = [];

    for (let i = 0; i < this.samplesPlanned; i++) {
      setTimeout(() => {
        this.samples.push(randDigit());
      }, (i * 1000) % 59000);
    }

    const finalTime = new Date(minuteStart);
    const previewTime = new Date(finalTime.getTime() - this.previewOffset * 1000);
    const now = new Date();

    setTimeout(() => this.publishPreview(), previewTime - now);
    setTimeout(() => this.publishFinal(), finalTime - now);

    setTimeout(() => {
      if (engineRunning) this.scheduleNextMinute();
    }, finalTime - now + 2000);
  }

  stats() {
    const counts = {};
    for (let i = 0; i < 10; i++) counts[i] = 0;
    this.samples.forEach((d) => counts[d]++);
    return counts;
  }

  publishPreview() {
    broadcast({
      type: "preview",
      minuteStart: isoUTC(this.currentMinuteStart),
      publishedAt: isoUTC(new Date()),
      samplesPlanned: this.samplesPlanned,
      samplesTaken: this.samples.length,
      counts: this.stats()
    });
  }

  publishFinal() {
    const finalDigit = randDigit();
    broadcast({
      type: "final",
      minuteStart: isoUTC(this.currentMinuteStart),
      lockedAt: isoUTC(new Date()),
      finalDigit,
      samplesPlanned: this.samplesPlanned,
      samplesTaken: this.samples.length,
      counts: this.stats()
    });
  }
}

const engine = new MinuteEngine();
engine.start();

function broadcast(obj) {
  const text = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(text);
  });
}

app.get("/health", (req, res) => res.send("ok"));

server.listen(PORT, () => {
  console.log(`CSPRNG server running on ${PORT}`);
});