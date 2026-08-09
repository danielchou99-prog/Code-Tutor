import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , portText, url, widthText, heightText, screenshotPath, action = "none"] =
  process.argv;

if (!portText || !url || !widthText || !heightText || !screenshotPath) {
  throw new Error(
    "Usage: node browser-validation.mjs <port> <url> <width> <height> <screenshot> [project|problems|interactive|language-menu|english|english-problems|run|run-blocked]",
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

const wantsEnglish = action === "english" || action === "english-problems";
const currentLanguage = await evaluate(client, `document.documentElement.lang`);
if ((wantsEnglish && currentLanguage !== "en") || (!wantsEnglish && currentLanguage === "en")) {
  const languageClicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) =>
          candidate.getAttribute("aria-label")?.includes("interface language") ||
          candidate.getAttribute("aria-label")?.includes("介面語言"),
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!languageClicked) throw new Error("Language switch button was not found.");
  await sleep(200);
  const languageOptionClicked = await evaluate(
    client,
    `(() => {
      const option = [...document.querySelectorAll('[role="menuitemradio"]')].find(
        (candidate) => candidate.textContent.includes(${JSON.stringify(wantsEnglish ? "English" : "繁體中文")}),
      );
      if (!option) return false;
      option.click();
      return true;
    })()`,
  );
  if (!languageOptionClicked) throw new Error("Language menu option was not found.");
  await sleep(500);
}

let actionSucceeded = action === "none";
if (action === "language-menu") {
  const opened = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.getAttribute("aria-haspopup") === "menu",
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!opened) throw new Error("Language menu button was not found.");
  await sleep(300);
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const trigger = document.querySelector('button[aria-haspopup="menu"]');
      const labels = [...document.querySelectorAll('[role="menuitemradio"]')].map(
        (item) => item.textContent.replace("✓", "").trim(),
      );
      return trigger &&
        trigger.textContent.includes("繁體中文") &&
        !trigger.textContent.includes("語言") &&
        trigger.previousElementSibling?.textContent.trim() === "語言" &&
        labels.length === 2 &&
        labels.includes("繁體中文") &&
        labels.includes("English") &&
        !labels.includes("中") &&
        !labels.includes("EN");
    })()`,
  );
}
if (action === "english") {
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const trigger = document.querySelector('button[aria-haspopup="menu"]');
      return document.documentElement.lang === "en" &&
      document.body.innerText.includes("File") &&
      trigger?.textContent.includes("English") &&
      !trigger?.textContent.includes("Language") &&
      trigger?.previousElementSibling?.textContent.trim() === "Language" &&
      document.body.innerText.includes("New Folder") &&
      document.body.innerText.includes("New Project") &&
      document.body.innerText.includes("C++ 基礎練習") &&
      !document.body.innerText.includes("C++ Fundamentals") &&
      !document.body.innerText.includes("Your current main.cpp and Online Compiler") &&
      !document.body.innerText.includes("檔案");
    })()`,
  );
}
if (action === "project" || action === "interactive" || action === "run" || action === "run-blocked") {
  const opened = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.includes("C++ 基礎練習"),
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!opened) throw new Error("Project card was not found.");
  await sleep(4_000);
  if (action === "project") {
    actionSucceeded = await evaluate(
      client,
      `[...document.querySelectorAll("button")].some(
        (candidate) => candidate.textContent.includes("Run"),
      ) && document.body.innerText.includes("INPUT") && document.body.innerText.includes("OUTPUT")`,
    );
  }
}
if (action === "interactive") {
  const inputSelected = await evaluate(
    client,
    `(() => {
      const inputTab = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "輸入",
      );
      if (!inputTab) return false;
      inputTab.click();
      return true;
    })()`,
  );
  if (!inputSelected) throw new Error("Input tab was not found.");
  await sleep(300);

  const consoleSelected = await evaluate(
    client,
    `(() => {
      const consoleButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Interactive Console",
      );
      if (!consoleButton) return false;
      consoleButton.click();
      return true;
    })()`,
  );
  if (!consoleSelected) throw new Error("Interactive Console control was not found.");
  await sleep(300);

  const runSelected = await evaluate(
    client,
    `(() => {
      const runButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.includes("Run"),
      );
      if (!runButton) return false;
      runButton.click();
      return true;
    })()`,
  );
  if (!runSelected) throw new Error("Run button was not found.");

  let consoleReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    consoleReady = await evaluate(
      client,
      `Boolean(document.querySelector('input[aria-label="輸入內容後按 Enter…"]:not(:disabled)'))`,
    );
    if (consoleReady) break;
    await sleep(500);
  }
  if (!consoleReady) throw new Error("Interactive Console did not become ready.");

  await evaluate(
    client,
    `(() => {
      const input = document.querySelector('input[aria-label="輸入內容後按 Enter…"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "5 1 2 3 4 5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form?.requestSubmit();
      return true;
    })()`,
  );

  for (let attempt = 0; attempt < 30; attempt += 1) {
    actionSucceeded = await evaluate(
      client,
      `document.body.innerText.includes("15") && document.body.innerText.includes("程式執行成功")`,
    );
    if (actionSucceeded) break;
    await sleep(500);
  }
}
if (action === "problems" || action === "english-problems") {
  const englishProblems = action === "english-problems";
  const clicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === ${JSON.stringify(englishProblems ? "Problems" : "題目")},
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("Problems navigation button was not found.");
  await sleep(1_000);
  const tagsEntered = await evaluate(
    client,
    `(() => {
      const input = document.querySelector('input[placeholder*="#"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(englishProblems ? "#APCSIntermediateAdvanced #BinarySearch" : "#APCS中高級 #二分搜")});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  if (!tagsEntered) throw new Error("Problem search field was not found.");
  await sleep(500);
  actionSucceeded = await evaluate(
    client,
    englishProblems
      ? `document.documentElement.lang === "en" &&
          document.body.innerText.includes("1 problems found") &&
          document.body.innerText.includes("Find a Target in a Sorted Array") &&
          !document.body.innerText.includes("Shortest Path Through a Maze") &&
          [...document.querySelectorAll('button[aria-pressed="true"]')].some(
            (button) => button.textContent.trim() === "#APCSIntermediateAdvanced",
          ) &&
          [...document.querySelectorAll('button[aria-pressed="true"]')].some(
            (button) => button.textContent.trim() === "#BinarySearch",
          )`
      : `document.documentElement.lang === "zh-Hant" &&
          document.body.innerText.includes("找到 1 題") &&
          document.body.innerText.includes("在排序陣列中尋找目標") &&
          !document.body.innerText.includes("迷宮的最短路徑") &&
          [...document.querySelectorAll('button[aria-pressed="true"]')].some(
            (button) => button.textContent.trim() === "#APCS中高級",
          ) &&
          [...document.querySelectorAll('button[aria-pressed="true"]')].some(
            (button) => button.textContent.trim() === "#二分搜",
          )`,
  );
}
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
      fileHomeVisible:
        outputText.includes("新增資料夾") && outputText.includes("新增專案"),
      problemsVisible:
        outputText.includes("尋找適合你的練習題") &&
        outputText.includes("#APCS中高級") &&
        outputText.includes("#二分搜"),
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
