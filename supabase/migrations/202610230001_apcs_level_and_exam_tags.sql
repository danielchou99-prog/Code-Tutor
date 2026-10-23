-- Code Tutor: APCS practice level on problems and the standard exam-topic tags.
-- Safe to run again from the Supabase SQL Editor. Run it before deploying the matching code.

-- Practice level 1-5 (not an official APCS score). NULL means the problem is not rated yet.
alter table public.problems
  add column if not exists apcs_level smallint;

alter table public.problems
  drop constraint if exists problems_apcs_level_check;

alter table public.problems
  add constraint problems_apcs_level_check
  check (apcs_level is null or apcs_level between 1 and 5);

-- Standard exam-topic tags. Existing tags keep their current labels.
insert into public.problem_tags (slug, label_zh, label_en) values
  ('apcs', 'APCS', 'APCS'),
  ('array', '陣列', 'Array'),
  ('string', '字串', 'String'),
  ('recursion', '遞迴', 'Recursion'),
  ('sorting', '排序', 'Sorting'),
  ('stack-queue', '堆疊與佇列', 'Stack and Queue'),
  ('dfs', '深度優先搜尋', 'DFS'),
  ('bfs', '廣度優先搜尋', 'BFS'),
  ('dynamic-programming', '動態規劃', 'Dynamic Programming'),
  ('greedy', '貪心', 'Greedy'),
  ('binary-search', '二分搜尋', 'Binary Search'),
  ('prefix-sum', '前綴和', 'Prefix Sum'),
  ('tree', '樹', 'Tree'),
  ('graph', '圖論', 'Graph'),
  ('simulation', '模擬', 'Simulation')
on conflict (slug) do nothing;
