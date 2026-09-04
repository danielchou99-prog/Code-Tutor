export type ProblemDifficulty = "easy" | "medium" | "hard";
export type ProblemStatus = "solved" | "attempted" | "unsolved";
export type ProblemTag = string;

export type LocalizedText = {
  zh: string;
  en: string;
};

export type ProblemSample = {
  input: string;
  output: string;
  explanation?: LocalizedText;
};

export type ProblemTestGroup = {
  name: LocalizedText;
  condition: LocalizedText;
  testCaseCount: number;
  scorePercent: number;
};

export type Problem = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  difficulty: ProblemDifficulty;
  status: ProblemStatus;
  tags: ProblemTag[];
  description: LocalizedText[];
  inputFormat: LocalizedText;
  outputFormat: LocalizedText;
  samples: ProblemSample[];
  constraints: LocalizedText[];
  testGroups: ProblemTestGroup[];
  timeLimitMs: number;
  memoryLimitMb: number;
  starterCode: Record<"cpp" | "python", string>;
};

const helloWorldStarterCode: Problem["starterCode"] = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << '\\n';
    return 0;
}
`,
  python: `print("Hello, World!")
`,
};

export const tagLabels: Record<ProblemTag, LocalizedText> = {
  math: { zh: "數學", en: "Math" },
  implementation: { zh: "實作", en: "Implementation" },
  "binary-search": { zh: "二分搜尋", en: "Binary Search" },
  array: { zh: "陣列", en: "Array" },
  bfs: { zh: "廣度優先搜尋", en: "BFS" },
  graph: { zh: "圖論", en: "Graph" },
  "dynamic-programming": { zh: "動態規劃", en: "Dynamic Programming" },
  matrix: { zh: "矩陣", en: "Matrix" },
  enumeration: { zh: "枚舉", en: "Enumeration" },
  apcs: { zh: "APCS", en: "APCS" },
};

export function registerProblemTagLabels(labels: Record<string, LocalizedText>) {
  Object.assign(tagLabels, labels);
}

export function getProblemTagLabel(tag: ProblemTag): LocalizedText {
  return tagLabels[tag] ?? { zh: tag, en: tag };
}

export const problems: Problem[] = [
  {
    id: "a101",
    title: { zh: "星際補給站", en: "Orbital Supply Depot" },
    summary: { zh: "合併兩批送達太空站的補給數量。", en: "Combine two supply shipments delivered to an orbital station." },
    difficulty: "easy",
    status: "solved",
    tags: ["math", "implementation"],
    description: [
      { zh: "兩艘運輸船分別帶來 A 與 B 箱補給品。請計算太空站本次總共收到多少箱補給品。", en: "Two cargo ships deliver A and B supply crates. Calculate the total number of crates received by the station." },
    ],
    inputFormat: { zh: "一行包含兩個以空白分隔的整數 A 與 B，代表兩艘運輸船的補給箱數。", en: "One line contains two space-separated integers A and B, the crate counts from the two ships." },
    outputFormat: { zh: "輸出一個整數，代表太空站收到的補給品總數。", en: "Print one integer: the total number of supply crates." },
    samples: [
      { input: "1 2", output: "3" },
      { input: "-5 12", output: "7" },
    ],
    constraints: [{ zh: "−10⁹ ≤ A, B ≤ 10⁹", en: "−10⁹ ≤ A, B ≤ 10⁹" }],
    testGroups: [
      { name: { zh: "小範圍", en: "Small range" }, condition: { zh: "−100 ≤ A, B ≤ 100", en: "−100 ≤ A, B ≤ 100" }, testCaseCount: 4, scorePercent: 40 },
      { name: { zh: "完整範圍", en: "Full range" }, condition: { zh: "無額外限制", en: "No additional constraints" }, testCaseCount: 6, scorePercent: 60 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "b202",
    title: { zh: "古老書庫", en: "The Ancient Archive" },
    summary: { zh: "在依編號排列的書架中找出指定古籍最早的位置。", en: "Find the earliest shelf position of a requested volume in a sorted archive." },
    difficulty: "medium",
    status: "attempted",
    tags: ["binary-search", "array"],
    description: [
      { zh: "古老書庫的 N 本典籍依編號由小到大排列，館員要尋找編號 X。請輸出 X 第一次出現的位置。", en: "The archive stores N volumes in nondecreasing order by catalog number. Find the first position where catalog number X appears." },
      { zh: "如果書庫中沒有編號 X，請輸出 −1。位置從 0 開始計算。", en: "If catalog number X is absent, print −1. Positions are zero-indexed." },
    ],
    inputFormat: { zh: "第一行包含 N 與 X。第二行包含 N 個由小到大排列的典籍編號。", en: "The first line contains N and X. The second line contains N catalog numbers in sorted order." },
    outputFormat: { zh: "輸出編號 X 第一次出現的位置；若不存在則輸出 −1。", en: "Print the first position of X, or −1 if it does not exist." },
    samples: [
      { input: "7 4\n1 2 4 4 4 8 10", output: "2", explanation: { zh: "數值 4 第一次出現在索引 2。", en: "The first 4 appears at index 2." } },
      { input: "5 6\n1 2 3 4 5", output: "-1" },
    ],
    constraints: [
      { zh: "1 ≤ N ≤ 200,000", en: "1 ≤ N ≤ 200,000" },
      { zh: "−10⁹ ≤ 陣列元素, X ≤ 10⁹", en: "−10⁹ ≤ array values, X ≤ 10⁹" },
    ],
    testGroups: [
      { name: { zh: "小範圍且無重複", en: "Small unique range" }, condition: { zh: "N ≤ 1,000，且陣列元素皆不重複", en: "N ≤ 1,000 and all array values are unique" }, testCaseCount: 8, scorePercent: 40 },
      { name: { zh: "完整範圍", en: "Full range" }, condition: { zh: "無額外限制", en: "No additional constraints" }, testCaseCount: 12, scorePercent: 60 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "c303",
    title: { zh: "迷霧森林", en: "Forest of Mist" },
    summary: { zh: "找出旅人穿越森林抵達出口所需的最少步數。", en: "Find the fewest steps needed for a traveler to reach the forest exit." },
    difficulty: "medium",
    status: "unsolved",
    tags: ["bfs", "graph"],
    description: [
      { zh: "森林地圖由 H × W 個格子組成，S 是旅人的起點、E 是出口、# 是無法通行的岩壁、. 是可行走的道路。", en: "The forest is an H × W grid. S is the traveler, E is the exit, # is an impassable rock, and . is open ground." },
      { zh: "旅人每一步可以往上、下、左、右移動一格。請計算抵達出口的最少步數。", en: "The traveler may move one cell up, down, left, or right. Find the minimum number of steps needed to reach the exit." },
    ],
    inputFormat: { zh: "第一行包含 H 與 W，接下來 H 行為森林地圖。", en: "The first line contains H and W, followed by H rows describing the forest." },
    outputFormat: { zh: "輸出抵達出口的最少步數；如果無法抵達，輸出 −1。", en: "Print the minimum number of steps, or −1 if the exit is unreachable." },
    samples: [
      { input: "3 4\nS...\n.##.\n...E", output: "5" },
    ],
    constraints: [{ zh: "1 ≤ H, W ≤ 1,000", en: "1 ≤ H, W ≤ 1,000" }],
    testGroups: [
      { name: { zh: "小型迷宮", en: "Small mazes" }, condition: { zh: "H, W ≤ 30", en: "H, W ≤ 30" }, testCaseCount: 10, scorePercent: 30 },
      { name: { zh: "完整範圍", en: "Full range" }, condition: { zh: "無額外限制", en: "No additional constraints" }, testCaseCount: 20, scorePercent: 70 },
    ],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "d404",
    title: { zh: "彗星撞擊", en: "Comet Impact" },
    summary: { zh: "從連續觀測紀錄中找出能量最強的一段撞擊期。", en: "Find the strongest impact period in a sequence of energy observations." },
    difficulty: "hard",
    status: "unsolved",
    tags: ["dynamic-programming", "array"],
    description: [
      { zh: "觀測站記錄了連續 N 個時段的能量變化 Ai。請找出一段非空的連續時段，使其中的能量變化總和最大。", en: "An observatory records energy changes Ai over N consecutive periods. Find a non-empty consecutive interval with the maximum total energy change." },
    ],
    inputFormat: { zh: "第一行包含 N。第二行包含 N 個整數，依序代表每個時段的能量變化。", en: "The first line contains N. The second line contains N integers describing the energy change in each period." },
    outputFormat: { zh: "輸出能量變化總和最大的連續時段之總和。", en: "Print the maximum total energy change over a consecutive interval." },
    samples: [
      { input: "8\n-2 -3 4 -1 -2 1 5 -3", output: "7" },
      { input: "3\n-5 -1 -8", output: "-1" },
      { input: "5\n1 2 3 4 5", output: "15" },
    ],
    constraints: [
      { zh: "1 ≤ N ≤ 1,000,000", en: "1 ≤ N ≤ 1,000,000" },
      { zh: "−10⁹ ≤ Ai ≤ 10⁹", en: "−10⁹ ≤ Ai ≤ 10⁹" },
    ],
    testGroups: [
      { name: { zh: "小範圍", en: "Small range" }, condition: { zh: "N ≤ 5,000", en: "N ≤ 5,000" }, testCaseCount: 10, scorePercent: 30 },
      { name: { zh: "完整範圍", en: "Full range" }, condition: { zh: "無額外限制", en: "No additional constraints" }, testCaseCount: 20, scorePercent: 70 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
];
