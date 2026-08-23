import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , portText, url, widthText, heightText, screenshotPath, action = "none"] =
  process.argv;

if (!portText || !url || !widthText || !heightText || !screenshotPath) {
  throw new Error(
    "Usage: node browser-validation.mjs <port> <url> <width> <height> <screenshot> [current|account|account-clear|files-guest|settings|settings-light|home-logo|project|problems|problem-grid|problem-navigation|problem-detail|problem-ai|problem-refresh|interactive|language-menu|english|english-problems|run|run-blocked]",
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

let target;
if (action === "current") {
  const targetsResponse = await fetch(`http://127.0.0.1:${port}/json`);
  const targets = await targetsResponse.json();
  target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith(url));
  if (!target) throw new Error("An existing browser target was not found.");
} else {
  const targetResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!targetResponse.ok) {
    throw new Error(`Unable to create browser target: HTTP ${targetResponse.status}`);
  }
  target = await targetResponse.json();
}

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

let actionSucceeded = action === "none" || action === "current";
if (action === "account") {
  await sleep(2_000);
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const accountButton = document.querySelector('button[aria-label="開啟帳號選單"]');
      if (!accountButton) return false;
      accountButton.click();
      return true;
    })()`,
  );
  await sleep(300);
  actionSucceeded = await evaluate(
    client,
    `Boolean(document.querySelector('[role="dialog"]'))`,
  );
}
if (action === "account-clear") {
  await sleep(2_000);
  const opened = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('button[aria-haspopup="dialog"]');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!opened) throw new Error("Account menu button was not found.");
  await sleep(300);

  const valuesEntered = await evaluate(
    client,
    `(() => {
      const email = document.querySelector('[role="dialog"] input[type="email"]');
      const password = document.querySelector('[role="dialog"] input[type="password"]');
      if (!email || !password) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(email, "privacy-test@example.com");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(password, "temporary-password");
      password.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  if (!valuesEntered) throw new Error("Account fields were not found.");
  await sleep(200);

  const closed = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[role="dialog"] button[aria-label]');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!closed) throw new Error("Account close button was not found.");
  await sleep(200);

  await evaluate(
    client,
    `document.querySelector('button[aria-haspopup="dialog"]')?.click()`,
  );
  await sleep(300);
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const email = document.querySelector('[role="dialog"] input[type="email"]');
      const password = document.querySelector('[role="dialog"] input[type="password"]');
      return Boolean(
        email && password &&
        email.value === "" && password.value === "" &&
        email.autocomplete === "off" && password.autocomplete === "off"
      );
    })()`,
  );
}
if (action === "files-guest") {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "檔案",
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("File navigation button was not found.");
  await sleep(500);
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const text = document.body.innerText;
      return text.includes("請先登入，才能建立並保存自己的資料夾與專案。") &&
        !text.includes("C++ 基礎練習") &&
        !text.includes("APCS 題目整理");
    })()`,
  );
}
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
      document.body.innerText.includes("Problems") &&
      document.body.innerText.includes("Settings") &&
      document.body.innerText.includes("Sign in") &&
      trigger?.textContent.includes("English") &&
      !trigger?.textContent.includes("Language") &&
      trigger?.previousElementSibling?.textContent.trim() === "Language" &&
      !document.body.innerText.includes("檔案");
    })()`,
  );
}
if (action === "settings" || action === "settings-light" || action === "home-logo") {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "設定",
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("Settings navigation button was not found.");
  await sleep(500);

  if (action === "settings") {
    actionSucceeded = await evaluate(
      client,
      `(() => {
        const text = document.body.innerText;
        return text.includes("個人資料") && text.includes("外觀") &&
          text.includes("Compiler / Editor") && text.includes("版面配置") &&
          text.includes("執行設定") && text.includes("快捷鍵") &&
          text.includes("通知") && text.includes("語言") &&
          text.includes("AI / Groq") && text.includes("帳號安全") &&
          text.includes("危險區域") && !text.includes("關於我們");
      })()`,
    );
  }

  if (action === "settings-light") {
    const appearanceClicked = await evaluate(
      client,
      `(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.trim() === "外觀",
        );
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!appearanceClicked) throw new Error("Appearance settings button was not found.");
    await sleep(300);
    const lightClicked = await evaluate(
      client,
      `(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.trim() === "淺色",
        );
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!lightClicked) throw new Error("Light theme button was not found.");
    await sleep(300);
    actionSucceeded = await evaluate(
      client,
      `document.querySelector('main')?.dataset.codeTutorTheme === "light" &&
        JSON.parse(localStorage.getItem("code-tutor:settings") ?? "{}").theme === "light"`,
    );
  }

  if (action === "home-logo") {
    const logoClicked = await evaluate(
      client,
      `(() => {
        const button = document.querySelector('header button[aria-label="首頁"]');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!logoClicked) throw new Error("Code Tutor home button was not found.");
    await sleep(300);
    actionSucceeded = await evaluate(
      client,
      `document.body.innerText.includes("從寫下第一行，到真正理解每一行")`,
    );
  }
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
if (action === "problems" || action === "problem-grid" || action === "problem-navigation" || action === "english-problems" || action === "problem-detail" || action === "problem-ai" || action === "problem-refresh") {
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
  if (action === "problem-detail" || action === "problem-ai" || action === "problem-refresh" || action === "problem-navigation") {
    const problemOpened = await evaluate(
      client,
      `(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.includes("A + B") && candidate.textContent.includes("#1001"),
        );
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!problemOpened) throw new Error("Problem detail button was not found.");
    await sleep(2_000);
    if (action === "problem-navigation") {
      const destinations = ["首頁", "檔案", "設定"];
      let navigationPassed = true;
      for (const destination of destinations) {
        const destinationClicked = await evaluate(
          client,
          `(() => {
            const button = [...document.querySelectorAll("button")].find(
              (candidate) => candidate.textContent.trim() === ${JSON.stringify(destination)},
            );
            if (!button) return false;
            button.click();
            return true;
          })()`,
        );
        if (!destinationClicked) {
          navigationPassed = false;
          break;
        }
        await sleep(400);
        const arrived = await evaluate(
          client,
          `(() => {
            const active = [...document.querySelectorAll('button[aria-current="page"]')].some(
              (button) => button.textContent.trim() === ${JSON.stringify(destination)},
            );
            return active && !document.body.innerText.includes("題目描述");
          })()`,
        );
        if (!arrived) {
          navigationPassed = false;
          break;
        }
        if (destination !== destinations.at(-1)) {
          await evaluate(
            client,
            `([...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "題目"))?.click()`,
          );
          await sleep(400);
          const reopened = await evaluate(
            client,
            `(() => {
              const button = [...document.querySelectorAll("button")].find(
                (candidate) => candidate.textContent.includes("A + B") && candidate.textContent.includes("#1001"),
              );
              if (!button) return false;
              button.click();
              return true;
            })()`,
          );
          if (!reopened) {
            navigationPassed = false;
            break;
          }
          await sleep(400);
        }
      }
      actionSucceeded = navigationPassed;
    } else if (action === "problem-refresh") {
      const reloaded = client.waitFor("Page.loadEventFired");
      await client.send("Page.reload", { ignoreCache: true });
      await reloaded;
      await sleep(1_500);
      const detailRestored = await evaluate(
        client,
        `document.body.innerText.includes("題目描述") && document.body.innerText.includes("A + B")`,
      );
      if (!detailRestored) throw new Error("Problem detail was not restored after refresh.");
      const problemsClicked = await evaluate(
        client,
        `(() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent.trim() === "題目",
          );
          if (!button) return false;
          button.click();
          return true;
        })()`,
      );
      if (!problemsClicked) throw new Error("Problems navigation button was not found on detail view.");
      await sleep(500);
      actionSucceeded = await evaluate(
        client,
        `document.body.innerText.includes("題目列表") && !document.body.innerText.includes("題目描述")`,
      );
    } else if (action === "problem-ai") {
      const aiOpened = await evaluate(
        client,
        `(() => {
          const button = document.querySelector('button[aria-label="開啟 AI Tutor"]');
          if (!button) return false;
          button.click();
          return true;
        })()`,
      );
      if (!aiOpened) throw new Error("AI Tutor button was not found.");
      await sleep(300);
      actionSucceeded = await evaluate(
        client,
        `(() => {
          const close = document.querySelector('button[aria-label="關閉 AI Tutor"]');
          const coach = [...document.querySelectorAll("span")].find(
            (item) => item.textContent.trim() === "引導模式",
          );
          if (!close || !coach) return false;
          const closeBounds = close.getBoundingClientRect();
          const coachBounds = coach.getBoundingClientRect();
          const overlaps = !(closeBounds.right <= coachBounds.left || closeBounds.left >= coachBounds.right || closeBounds.bottom <= coachBounds.top || closeBounds.top >= coachBounds.bottom);
          const panel = close.closest("aside")?.parentElement;
          const panelBounds = panel?.getBoundingClientRect();
          return closeBounds.width >= 36 && closeBounds.height >= 36 && !overlaps && Boolean(panelBounds && panelBounds.top >= 112);
        })()`,
      );
    } else {
    const defaultInputVisible = await evaluate(
      client,
      `document.body.innerText.includes("Text") && document.body.innerText.includes("Interactive Console") && Boolean(document.querySelector('textarea[aria-label="標準輸入"]'))`,
    );
    if (!defaultInputVisible) throw new Error("Problem compiler did not open on Input by default.");
    const languageMenuOpened = await evaluate(
      client,
      `(() => {
        const trigger = document.querySelector('button[aria-label="選擇程式語言"]');
        if (!trigger) return false;
        trigger.click();
        return true;
      })()`,
    );
    if (!languageMenuOpened) throw new Error("Programming language menu was not available.");
    await sleep(200);
    const languageChanged = await evaluate(
      client,
      `(() => {
        const python = [...document.querySelectorAll('[role="menuitemradio"]')].find(
          (item) => item.textContent.includes("Python 3"),
        );
        if (!python) return false;
        python.click();
        return true;
      })()`,
    );
    if (!languageChanged) {
      const visibleText = await evaluate(client, `document.body.innerText.slice(-1400)`);
      throw new Error(`Python language option was not available. Visible text: ${visibleText}`);
    }
    await evaluate(
      client,
      `([...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Submit",
      ))?.click()`,
    );
    await sleep(500);
    actionSucceeded = await evaluate(
      client,
      `(() => {
        const text = document.body.innerText;
        const upperText = text.toUpperCase();
        return text.includes("題目描述") && text.includes("輸入格式") &&
          text.includes("輸出格式") && upperText.includes("TIME LIMIT") &&
          upperText.includes("MEMORY LIMIT") && text.includes("測資與計分") &&
          text.includes("Python 3") && !text.includes("main.cpp") &&
          text.includes("Text") && text.includes("Interactive Console") &&
          text.includes("範例輸入 1") && text.includes("範例輸出 1") &&
          text.includes("範例輸入 2") && text.includes("範例輸出 2") &&
          text.includes("請先登入 Code Tutor") && !text.includes("SUBMIT ONLY") &&
          Boolean(document.querySelector('button[aria-label="開啟 AI Tutor"]'));
      })()`,
    );
    }
  } else if (action === "problem-grid") {
  actionSucceeded = await evaluate(
    client,
    `(() => {
      const cards = [...document.querySelectorAll('button[aria-label^="開啟題目"]')];
      const grid = cards[0]?.parentElement?.parentElement;
      if (!grid || cards.length !== 4) return false;
      const columnCount = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      const firstTop = cards[0].getBoundingClientRect().top;
      return columnCount >= 5 && cards.every((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 2);
    })()`,
  );
  } else {
  const tagsEntered = await evaluate(
    client,
    `(() => {
      const input = document.querySelector('input[placeholder*="#"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(englishProblems ? "#Math #Implementation" : "#數學 #實作")});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  if (!tagsEntered) {
    const visibleText = await evaluate(client, `document.body.innerText.slice(0, 1200)`);
    throw new Error(`Problem search field was not found. Visible text: ${visibleText}`);
  }
  await sleep(500);
  actionSucceeded = await evaluate(
    client,
    englishProblems
      ? `document.documentElement.lang === "en" &&
          document.body.innerText.includes("1 found") &&
          document.body.innerText.includes("A + B") &&
          !document.body.innerText.includes("Shortest Path Through a Maze")`
      : `document.documentElement.lang === "zh-Hant" &&
          document.body.innerText.includes("找到 1 題") &&
          document.body.innerText.includes("A + B") &&
          !document.body.innerText.includes("讀入兩個整數並輸出它們的總和") &&
          !document.body.innerText.includes("迷宮最短路徑")`,
  );
  }
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
      problemEditorLayout: (() => {
        const trigger = document.querySelector('button[aria-label="選擇程式語言"]');
        const section = trigger?.closest("section");
        if (!section) return null;
        return [...section.children].map((element) => {
          const bounds = element.getBoundingClientRect();
          return { tag: element.tagName, top: bounds.top, height: bounds.height, bottom: bounds.bottom };
        });
      })(),
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
if (action !== "current") await client.send("Page.close");
socket.close();
