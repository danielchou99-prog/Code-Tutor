export type ProblemDifficulty = "easy" | "medium" | "hard";
export type ProblemStatus = "solved" | "attempted" | "unsolved";
export type ProblemTag = "math" | "implementation" | "binary-search" | "array" | "bfs" | "graph" | "dynamic-programming";

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
};

export const problems: Problem[] = [
  {
    id: "1001",
    title: { zh: "A + B", en: "A + B" },
    summary: { zh: "讀入兩個整數並輸出它們的總和。", en: "Read two integers and print their sum." },
    difficulty: "easy",
    status: "solved",
    tags: ["math", "implementation"],
    description: [
      { zh: "給定兩個整數 A 與 B，請計算並輸出 A + B。", en: "Given two integers A and B, calculate and print A + B." },
    ],
    inputFormat: { zh: "一行包含兩個以空白分隔的整數 A 與 B。", en: "One line contains two space-separated integers A and B." },
    outputFormat: { zh: "輸出一個整數，代表 A + B。", en: "Print one integer: A + B." },
    samples: [
      { input: "1 2", output: "3" },
      { input: "-5 12", output: "7" },
    ],
    constraints: [{ zh: "−10⁹ ≤ A, B ≤ 10⁹", en: "−10⁹ ≤ A, B ≤ 10⁹" }],
    testGroups: [
      { name: { zh: "基礎測資", en: "Basic cases" }, testCaseCount: 4, scorePercent: 40 },
      { name: { zh: "邊界測資", en: "Boundary cases" }, testCaseCount: 6, scorePercent: 60 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "1002",
    title: { zh: "在排序陣列中尋找目標", en: "Find a Target in a Sorted Array" },
    summary: { zh: "使用二分搜尋找出目標值第一次出現的位置。", en: "Use binary search to find the first position of a target value." },
    difficulty: "medium",
    status: "attempted",
    tags: ["binary-search", "array"],
    description: [
      { zh: "給定一個由小到大排序的整數陣列，以及一個目標值 X。請找出 X 第一次出現的位置。", en: "Given a sorted integer array and a target X, find the first position where X appears." },
      { zh: "如果陣列中沒有 X，請輸出 −1。位置從 0 開始計算。", en: "If X does not exist, print −1. Positions are zero-indexed." },
    ],
    inputFormat: { zh: "第一行為 N 與 X。第二行包含 N 個由小到大排序的整數。", en: "The first line contains N and X. The second line contains N sorted integers." },
    outputFormat: { zh: "輸出 X 第一次出現的位置；若不存在則輸出 −1。", en: "Print the first position of X, or −1 if it does not exist." },
    samples: [
      { input: "7 4\n1 2 4 4 4 8 10", output: "2", explanation: { zh: "數值 4 第一次出現在索引 2。", en: "The first 4 appears at index 2." } },
      { input: "5 6\n1 2 3 4 5", output: "-1" },
    ],
    constraints: [
      { zh: "1 ≤ N ≤ 200,000", en: "1 ≤ N ≤ 200,000" },
      { zh: "−10⁹ ≤ 陣列元素, X ≤ 10⁹", en: "−10⁹ ≤ array values, X ≤ 10⁹" },
    ],
    testGroups: [
      { name: { zh: "無重複元素", en: "Unique values" }, testCaseCount: 8, scorePercent: 40 },
      { name: { zh: "完整測資", en: "Full cases" }, testCaseCount: 12, scorePercent: 60 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "1003",
    title: { zh: "迷宮最短路徑", en: "Shortest Path Through a Maze" },
    summary: { zh: "在方格迷宮中找出起點到終點的最少步數。", en: "Find the minimum number of steps through a grid maze." },
    difficulty: "medium",
    status: "unsolved",
    tags: ["bfs", "graph"],
    description: [
      { zh: "迷宮由 H × W 個格子組成，S 是起點、E 是終點、# 是牆壁、. 是可通行區域。", en: "The maze is an H × W grid. S is the start, E is the exit, # is a wall, and . is open." },
      { zh: "每一步可以往上、下、左、右移動一格，請輸出到達終點的最少步數。", en: "Move one cell up, down, left, or right. Print the minimum steps needed to reach E." },
    ],
    inputFormat: { zh: "第一行為 H 與 W，接下來 H 行為迷宮內容。", en: "The first line contains H and W, followed by H rows of the maze." },
    outputFormat: { zh: "輸出最少步數；如果無法到達，輸出 −1。", en: "Print the minimum steps, or −1 if the exit is unreachable." },
    samples: [
      { input: "3 4\nS...\n.##.\n...E", output: "5" },
      { input: "2 2\nS#\n.E", output: "2" },
    ],
    constraints: [{ zh: "1 ≤ H, W ≤ 1,000", en: "1 ≤ H, W ≤ 1,000" }],
    testGroups: [
      { name: { zh: "小型迷宮", en: "Small mazes" }, testCaseCount: 10, scorePercent: 30 },
      { name: { zh: "大型迷宮", en: "Large mazes" }, testCaseCount: 20, scorePercent: 70 },
    ],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
  {
    id: "1004",
    title: { zh: "最大連續和", en: "Maximum Contiguous Sum" },
    summary: { zh: "找出陣列中總和最大的連續區間。", en: "Find the contiguous segment with the largest sum." },
    difficulty: "hard",
    status: "unsolved",
    tags: ["dynamic-programming", "array"],
    description: [
      { zh: "給定 N 個整數，請找出一段非空的連續區間，使其元素總和最大。", en: "Given N integers, find a non-empty contiguous segment with the maximum sum." },
    ],
    inputFormat: { zh: "第一行為 N。第二行包含 N 個整數。", en: "The first line contains N. The second line contains N integers." },
    outputFormat: { zh: "輸出最大連續區間和。", en: "Print the maximum contiguous sum." },
    samples: [
      { input: "8\n-2 -3 4 -1 -2 1 5 -3", output: "7" },
      { input: "3\n-5 -1 -8", output: "-1" },
    ],
    constraints: [
      { zh: "1 ≤ N ≤ 1,000,000", en: "1 ≤ N ≤ 1,000,000" },
      { zh: "−10⁹ ≤ Ai ≤ 10⁹", en: "−10⁹ ≤ Ai ≤ 10⁹" },
    ],
    testGroups: [
      { name: { zh: "小範圍", en: "Small range" }, testCaseCount: 10, scorePercent: 30 },
      { name: { zh: "完整範圍", en: "Full range" }, testCaseCount: 20, scorePercent: 70 },
    ],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    starterCode: helloWorldStarterCode,
  },
];
