import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , portText, url, widthText, heightText, screenshotPath, action = "none"] =
  process.argv;

if (!portText || !url || !widthText || !heightText || !screenshotPath) {
  throw new Error(
    "Usage: node browser-validation.mjs <port> <url> <width> <height> <screenshot> [run]",
  );
}

const port = Number(portText);
const width = Number(widthText);
const height = Number(heightText);

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }

      const listeners = this.listeners.get(message.method) ?? [];
      this.listeners.delete(message.method);
      for (const listener of listeners) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs = 15_000) {
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      const listeners = this.listeners.get(method) ?? [];
      listeners.push((params) => {
        clearTimeout(timeout);
        resolvePromise(params);
      });
      this.listeners.set(method, listeners);
    });
  }
}

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed.");
  }
  return response.result.value;
}

const targetResponse = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
  { method: "PUT" },
);
if (!targetResponse.ok) {
  throw new Error(`Unable to create browser target: HTTP ${targetResponse.status}`);
}
const target = await targetResponse.json();

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolvePromise, reject) => {
  socket.addEventListener("open", resolvePromise, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const client = new CdpClient(socket);
await client.send("Page.enable");
await client.send("Runtime.enable");
if (action === "run-blocked") {
  await client.send("Network.enable");
  await client.send("Network.setBlockedURLs", {
    urls: ["http://localhost:8000/*", "http://127.0.0.1:8000/*"],
  });
}
await client.send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 600,
});

const loaded = client.waitFor("Page.loadEventFired");
await client.send("Page.navigate", { url });
await loaded;
await sleep(4_000);

let actionSucceeded = action === "none";
if (action === "run" || action === "run-blocked") {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.includes("Run"),
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("Run button was not found.");

  let errorVisible = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    errorVisible = await evaluate(
      client,
      `document.body.innerText.includes("Cannot reach the compiler API")`,
    );
    if (errorVisible) break;
    await sleep(500);
  }
  actionSucceeded = errorVisible;
}

const result = await evaluate(
  client,
  `(() => {
    const runButton = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.includes("Run"),
    );
    const outputText = document.body.innerText;
    const normalizedOutputText = outputText.toUpperCase();
    return {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      runButtonVisible: Boolean(runButton && runButton.getBoundingClientRect().width),
      inputTabVisible: normalizedOutputText.includes("INPUT"),
      outputTabVisible: normalizedOutputText.includes("OUTPUT"),
      compilerUnavailableVisible: outputText.includes("Cannot reach the compiler API"),
      visibleTextTail: outputText.slice(-800),
    };
  })()`,
);
result.actionSucceeded = actionSucceeded;

const screenshot = await client.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const absoluteScreenshotPath = resolve(screenshotPath);
await mkdir(dirname(absoluteScreenshotPath), { recursive: true });
await writeFile(absoluteScreenshotPath, Buffer.from(screenshot.data, "base64"));

console.log(JSON.stringify(result));
await client.send("Page.close");
socket.close();
