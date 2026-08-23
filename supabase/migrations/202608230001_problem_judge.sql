-- Code Tutor: public problem library, private judge cases, and trusted submissions.

create table if not exists public.problems (
  id text primary key check (id ~ '^[0-9]{4,12}$'),
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  description jsonb not null check (jsonb_typeof(description) = 'array'),
  input_format jsonb not null check (jsonb_typeof(input_format) = 'object'),
  output_format jsonb not null check (jsonb_typeof(output_format) = 'object'),
  constraints_text jsonb not null default '[]'::jsonb check (jsonb_typeof(constraints_text) = 'array'),
  starter_code jsonb not null check (jsonb_typeof(starter_code) = 'object'),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  time_limit_ms integer not null check (time_limit_ms between 100 and 10000),
  memory_limit_mb integer not null check (memory_limit_mb between 16 and 1024),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.problem_tags (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label_zh text not null check (char_length(label_zh) between 1 and 40),
  label_en text not null check (char_length(label_en) between 1 and 60)
);

create table if not exists public.problem_tag_links (
  problem_id text not null references public.problems(id) on delete cascade,
  tag_slug text not null references public.problem_tags(slug) on delete restrict,
  primary key (problem_id, tag_slug)
);

create table if not exists public.problem_samples (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null references public.problems(id) on delete cascade,
  sample_order smallint not null check (sample_order between 1 and 20),
  input text not null check (octet_length(input) <= 65536),
  output text not null check (octet_length(output) <= 65536),
  explanation jsonb check (explanation is null or jsonb_typeof(explanation) = 'object'),
  unique (problem_id, sample_order)
);

create table if not exists public.problem_test_groups (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null references public.problems(id) on delete cascade,
  group_order smallint not null check (group_order between 1 and 20),
  name jsonb not null check (jsonb_typeof(name) = 'object'),
  condition jsonb not null check (jsonb_typeof(condition) = 'object'),
  test_case_count integer not null check (test_case_count between 1 and 500),
  score_percent smallint not null check (score_percent between 1 and 100),
  unique (problem_id, group_order)
);

create table if not exists public.problem_test_cases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.problem_test_groups(id) on delete cascade,
  case_order smallint not null check (case_order between 1 and 500),
  input text not null check (octet_length(input) <= 65536),
  expected_output text not null check (octet_length(expected_output) <= 65536),
  unique (group_id, case_order)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete restrict,
  language text not null check (language in ('cpp', 'python')),
  source_code text not null check (octet_length(source_code) between 1 and 262144),
  status text not null check (status in (
    'accepted', 'wrong_answer', 'compile_error', 'runtime_error',
    'timeout', 'service_unavailable', 'server_busy'
  )),
  score smallint not null check (score between 0 and 100),
  passed_cases integer not null default 0 check (passed_cases >= 0),
  total_cases integer not null default 0 check (total_cases >= passed_cases),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  group_results jsonb not null default '[]'::jsonb check (jsonb_typeof(group_results) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists submissions_owner_created_index
  on public.submissions (user_id, created_at desc);
create index if not exists submissions_owner_problem_index
  on public.submissions (user_id, problem_id, score desc, created_at desc);
create index if not exists problem_test_cases_group_index
  on public.problem_test_cases (group_id, case_order);

create or replace function public.set_problem_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_problem_updated_at on public.problems;
create trigger set_problem_updated_at
before update on public.problems
for each row execute function public.set_problem_updated_at();

alter table public.problems enable row level security;
alter table public.problem_tags enable row level security;
alter table public.problem_tag_links enable row level security;
alter table public.problem_samples enable row level security;
alter table public.problem_test_groups enable row level security;
alter table public.problem_test_cases enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "Published problems are readable" on public.problems;
create policy "Published problems are readable"
on public.problems for select to anon, authenticated
using (published = true);

drop policy if exists "Problem tags are readable" on public.problem_tags;
create policy "Problem tags are readable"
on public.problem_tags for select to anon, authenticated using (true);

drop policy if exists "Published problem tag links are readable" on public.problem_tag_links;
create policy "Published problem tag links are readable"
on public.problem_tag_links for select to anon, authenticated
using (exists (select 1 from public.problems where problems.id = problem_id and problems.published));

drop policy if exists "Published problem samples are readable" on public.problem_samples;
create policy "Published problem samples are readable"
on public.problem_samples for select to anon, authenticated
using (exists (select 1 from public.problems where problems.id = problem_id and problems.published));

drop policy if exists "Published problem groups are readable" on public.problem_test_groups;
create policy "Published problem groups are readable"
on public.problem_test_groups for select to anon, authenticated
using (exists (select 1 from public.problems where problems.id = problem_id and problems.published));

-- Intentionally no anon/authenticated policy for problem_test_cases.
drop policy if exists "Users can read their submissions" on public.submissions;
create policy "Users can read their submissions"
on public.submissions for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.problems, public.problem_tags, public.problem_tag_links,
  public.problem_samples, public.problem_test_groups to anon, authenticated;
grant select on public.submissions to authenticated;
revoke all on public.problem_test_cases from anon, authenticated;
revoke insert, update, delete on public.submissions from anon, authenticated;
grant select on public.problems, public.problem_tags, public.problem_tag_links,
  public.problem_samples, public.problem_test_groups, public.problem_test_cases,
  public.submissions to service_role;
grant insert on public.submissions to service_role;
revoke all on function public.set_problem_updated_at() from public, anon, authenticated;

insert into public.problem_tags (slug, label_zh, label_en) values
  ('math', '數學', 'Math'),
  ('implementation', '實作', 'Implementation'),
  ('binary-search', '二分搜尋', 'Binary Search'),
  ('array', '陣列', 'Array'),
  ('bfs', '廣度優先搜尋', 'BFS'),
  ('graph', '圖論', 'Graph'),
  ('dynamic-programming', '動態規劃', 'Dynamic Programming')
on conflict (slug) do update set label_zh = excluded.label_zh, label_en = excluded.label_en;

insert into public.problems (
  id, title, summary, description, input_format, output_format,
  constraints_text, starter_code, difficulty, time_limit_ms, memory_limit_mb, published
) values
  (
    '1001', '{"zh":"A + B","en":"A + B"}',
    '{"zh":"讀入兩個整數並輸出它們的總和。","en":"Read two integers and print their sum."}',
    '[{"zh":"給定兩個整數 A 與 B，請計算並輸出 A + B。","en":"Given two integers A and B, calculate and print A + B."}]',
    '{"zh":"一行包含兩個以空白分隔的整數 A 與 B。","en":"One line contains two space-separated integers A and B."}',
    '{"zh":"輸出一個整數，代表 A + B。","en":"Print one integer: A + B."}',
    '[{"zh":"−10⁹ ≤ A, B ≤ 10⁹","en":"−10⁹ ≤ A, B ≤ 10⁹"}]',
    '{"cpp":"#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}\n","python":"print(\"Hello, World!\")\n"}',
    'easy', 1000, 256, true
  ),
  (
    '1002', '{"zh":"在排序陣列中尋找目標","en":"Find a Target in a Sorted Array"}',
    '{"zh":"使用二分搜尋找出目標值第一次出現的位置。","en":"Use binary search to find the first position of a target value."}',
    '[{"zh":"給定一個由小到大排序的整數陣列，以及一個目標值 X。請找出 X 第一次出現的位置。","en":"Given a sorted integer array and a target X, find the first position where X appears."},{"zh":"如果陣列中沒有 X，請輸出 −1。位置從 0 開始計算。","en":"If X does not exist, print −1. Positions are zero-indexed."}]',
    '{"zh":"第一行為 N 與 X。第二行包含 N 個由小到大排序的整數。","en":"The first line contains N and X. The second line contains N sorted integers."}',
    '{"zh":"輸出 X 第一次出現的位置；若不存在則輸出 −1。","en":"Print the first position of X, or −1 if it does not exist."}',
    '[{"zh":"1 ≤ N ≤ 200,000","en":"1 ≤ N ≤ 200,000"},{"zh":"−10⁹ ≤ 陣列元素, X ≤ 10⁹","en":"−10⁹ ≤ array values, X ≤ 10⁹"}]',
    '{"cpp":"#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}\n","python":"print(\"Hello, World!\")\n"}',
    'medium', 1000, 256, true
  ),
  (
    '1003', '{"zh":"迷宮最短路徑","en":"Shortest Path Through a Maze"}',
    '{"zh":"在方格迷宮中找出起點到終點的最少步數。","en":"Find the minimum number of steps through a grid maze."}',
    '[{"zh":"迷宮由 H × W 個格子組成，S 是起點、E 是終點、# 是牆壁、. 是可通行區域。","en":"The maze is an H × W grid. S is the start, E is the exit, # is a wall, and . is open."},{"zh":"每一步可以往上、下、左、右移動一格，請輸出到達終點的最少步數。","en":"Move one cell up, down, left, or right. Print the minimum steps needed to reach E."}]',
    '{"zh":"第一行為 H 與 W，接下來 H 行為迷宮內容。","en":"The first line contains H and W, followed by H rows of the maze."}',
    '{"zh":"輸出最少步數；如果無法到達，輸出 −1。","en":"Print the minimum steps, or −1 if the exit is unreachable."}',
    '[{"zh":"1 ≤ H, W ≤ 1,000","en":"1 ≤ H, W ≤ 1,000"}]',
    '{"cpp":"#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}\n","python":"print(\"Hello, World!\")\n"}',
    'medium', 2000, 256, true
  ),
  (
    '1004', '{"zh":"最大連續和","en":"Maximum Contiguous Sum"}',
    '{"zh":"找出陣列中總和最大的連續區間。","en":"Find the contiguous segment with the largest sum."}',
    '[{"zh":"給定 N 個整數，請找出一段非空的連續區間，使其元素總和最大。","en":"Given N integers, find a non-empty contiguous segment with the maximum sum."}]',
    '{"zh":"第一行為 N。第二行包含 N 個整數。","en":"The first line contains N. The second line contains N integers."}',
    '{"zh":"輸出最大連續區間和。","en":"Print the maximum contiguous sum."}',
    '[{"zh":"1 ≤ N ≤ 1,000,000","en":"1 ≤ N ≤ 1,000,000"},{"zh":"−10⁹ ≤ Ai ≤ 10⁹","en":"−10⁹ ≤ Ai ≤ 10⁹"}]',
    '{"cpp":"#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}\n","python":"print(\"Hello, World!\")\n"}',
    'hard', 1000, 256, true
  )
on conflict (id) do update set
  title = excluded.title, summary = excluded.summary, description = excluded.description,
  input_format = excluded.input_format, output_format = excluded.output_format,
  constraints_text = excluded.constraints_text, starter_code = excluded.starter_code,
  difficulty = excluded.difficulty, time_limit_ms = excluded.time_limit_ms,
  memory_limit_mb = excluded.memory_limit_mb, published = excluded.published;

insert into public.problem_tag_links (problem_id, tag_slug) values
  ('1001', 'math'), ('1001', 'implementation'),
  ('1002', 'binary-search'), ('1002', 'array'),
  ('1003', 'bfs'), ('1003', 'graph'),
  ('1004', 'dynamic-programming'), ('1004', 'array')
on conflict do nothing;

insert into public.problem_samples (problem_id, sample_order, input, output, explanation) values
  ('1001', 1, '1 2', '3', null),
  ('1001', 2, '-5 12', '7', null),
  ('1002', 1, E'7 4\n1 2 4 4 4 8 10', '2', '{"zh":"數值 4 第一次出現在索引 2。","en":"The first 4 appears at index 2."}'),
  ('1002', 2, E'5 6\n1 2 3 4 5', '-1', null),
  ('1003', 1, E'3 4\nS...\n.##.\n...E', '5', null),
  ('1004', 1, E'8\n-2 -3 4 -1 -2 1 5 -3', '7', null),
  ('1004', 2, E'3\n-5 -1 -8', '-1', null),
  ('1004', 3, E'5\n1 2 3 4 5', '15', null)
on conflict (problem_id, sample_order) do update set
  input = excluded.input, output = excluded.output, explanation = excluded.explanation;

insert into public.problem_test_groups (problem_id, group_order, name, condition, test_case_count, score_percent) values
  ('1001', 1, '{"zh":"小範圍","en":"Small range"}', '{"zh":"−100 ≤ A, B ≤ 100","en":"−100 ≤ A, B ≤ 100"}', 4, 40),
  ('1001', 2, '{"zh":"完整範圍","en":"Full range"}', '{"zh":"無額外限制","en":"No additional constraints"}', 6, 60),
  ('1002', 1, '{"zh":"小範圍且無重複","en":"Small unique range"}', '{"zh":"N ≤ 1,000，且陣列元素皆不重複","en":"N ≤ 1,000 and all array values are unique"}', 8, 40),
  ('1002', 2, '{"zh":"完整範圍","en":"Full range"}', '{"zh":"無額外限制","en":"No additional constraints"}', 12, 60),
  ('1003', 1, '{"zh":"小型迷宮","en":"Small mazes"}', '{"zh":"H, W ≤ 30","en":"H, W ≤ 30"}', 10, 30),
  ('1003', 2, '{"zh":"完整範圍","en":"Full range"}', '{"zh":"無額外限制","en":"No additional constraints"}', 20, 70),
  ('1004', 1, '{"zh":"小範圍","en":"Small range"}', '{"zh":"N ≤ 5,000","en":"N ≤ 5,000"}', 10, 30),
  ('1004', 2, '{"zh":"完整範圍","en":"Full range"}', '{"zh":"無額外限制","en":"No additional constraints"}', 20, 70)
on conflict (problem_id, group_order) do update set
  name = excluded.name, condition = excluded.condition,
  test_case_count = excluded.test_case_count, score_percent = excluded.score_percent;

-- A + B: 4 small and 6 full-range cases.
insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  format('%s %s', series.i * 7 - 15, series.i * series.i - 10),
  ((series.i * 7 - 15) + (series.i * series.i - 10))::text
from public.problem_test_groups g cross join generate_series(1, 4) as series(i)
where g.problem_id = '1001' and g.group_order = 1
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  format('%s %s', series.i * 100000000 - 350000000, case when series.i % 2 = 0 then 900000000 - series.i else -900000000 + series.i end),
  ((series.i * 100000000 - 350000000) + (case when series.i % 2 = 0 then 900000000 - series.i else -900000000 + series.i end))::text
from public.problem_test_groups g cross join generate_series(1, 6) as series(i)
where g.problem_id = '1001' and g.group_order = 2
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

-- Binary search: unique small arrays and duplicate-heavy full cases.
insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, valueset.case_order, valueset.input, valueset.expected
from public.problem_test_groups g cross join (values
  (1, E'5 5\n1 3 5 7 9', '2'), (2, E'5 2\n1 3 5 7 9', '-1'),
  (3, E'1 -8\n-8', '0'), (4, E'6 10\n-10 -5 0 5 10 15', '4'),
  (5, E'4 -3\n-9 -6 -3 0', '2'), (6, E'7 99\n1 2 3 4 5 6 7', '-1'),
  (7, E'8 0\n-4 -3 -2 -1 0 1 2 3', '4'), (8, E'3 100\n-100 0 100', '2')
) as valueset(case_order, input, expected)
where g.problem_id = '1002' and g.group_order = 1
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, valueset.case_order, valueset.input, valueset.expected
from public.problem_test_groups g cross join (values
  (1, E'7 4\n1 2 4 4 4 8 10', '2'), (2, E'6 1\n1 1 1 2 3 4', '0'),
  (3, E'6 4\n1 1 2 2 3 3', '-1'), (4, E'8 -2\n-5 -2 -2 -2 0 1 1 9', '1'),
  (5, E'5 7\n7 7 7 7 7', '0'), (6, E'10 3\n0 0 1 1 2 2 3 3 3 3', '6'),
  (7, E'4 -9\n-9 -9 -8 -7', '0'), (8, E'9 8\n1 2 3 4 5 6 7 8 8', '7'),
  (9, E'3 0\n-1 0 1', '1'), (10, E'2 4\n4 4', '0'),
  (11, E'5 6\n1 2 3 4 5', '-1'), (12, E'6 -1\n-3 -2 -1 -1 0 2', '2')
) as valueset(case_order, input, expected)
where g.problem_id = '1002' and g.group_order = 2
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

-- Maze: reachable corridors plus regular unreachable cases.
insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  case when series.i % 5 = 0 then E'1 3\nS#E'
       else format(E'1 %s\nS%sE', series.i + 3, repeat('.', series.i + 1)) end,
  case when series.i % 5 = 0 then '-1' else (series.i + 2)::text end
from public.problem_test_groups g cross join generate_series(1, 10) as series(i)
where g.problem_id = '1003' and g.group_order = 1
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  case when series.i % 6 = 0 then E'1 3\nS#E'
       else format(E'1 %s\nS%sE', series.i + 30, repeat('.', series.i + 28)) end,
  case when series.i % 6 = 0 then '-1' else (series.i + 29)::text end
from public.problem_test_groups g cross join generate_series(1, 20) as series(i)
where g.problem_id = '1003' and g.group_order = 2
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

-- Maximum contiguous sum: positive, all-negative, and mixed arrays.
insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  case when series.i % 3 = 0 then E'3\n-5 -1 -8'
       when series.i % 3 = 1 then format(E'%s\n%s', series.i + 2, positive.values_text)
       else E'8\n-2 -3 4 -1 -2 1 5 -3' end,
  case when series.i % 3 = 0 then '-1'
       when series.i % 3 = 1 then (((series.i + 2) * (series.i + 3)) / 2)::text
       else '7' end
from public.problem_test_groups g
cross join generate_series(1, 10) as series(i)
cross join lateral (
  select string_agg(generated.value::text, ' ' order by generated.value) as values_text
  from generate_series(1, series.i + 2) as generated(value)
) positive
where g.problem_id = '1004' and g.group_order = 1
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select g.id, series.i,
  case when series.i % 3 = 0 then E'3\n-500000000 -1 -800000000'
       when series.i % 3 = 1 then format(E'%s\n%s', series.i + 100, positive.values_text)
       else E'8\n-2 -3 4 -1 -2 1 5 -3' end,
  case when series.i % 3 = 0 then '-1'
       when series.i % 3 = 1 then (((series.i + 100) * (series.i + 101)) / 2)::text
       else '7' end
from public.problem_test_groups g
cross join generate_series(1, 20) as series(i)
cross join lateral (
  select string_agg(generated.value::text, ' ' order by generated.value) as values_text
  from generate_series(1, series.i + 100) as generated(value)
) positive
where g.problem_id = '1004' and g.group_order = 2
on conflict (group_id, case_order) do update set input = excluded.input, expected_output = excluded.expected_output;
