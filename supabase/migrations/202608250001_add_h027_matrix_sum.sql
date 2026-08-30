-- Add ZeroJudge h027 / January 2020 APCS Matrix Sum with original Code Tutor judge cases.

alter table public.problems drop constraint if exists problems_id_check;
alter table public.problems
  add constraint problems_id_check
  check (id ~ '^([0-9]{4,12}|[a-z][0-9]{3,11})$');

insert into public.problem_tags (slug, label_zh, label_en) values
  ('apcs', 'APCS', 'APCS'),
  ('matrix', '矩陣', 'Matrix'),
  ('enumeration', '枚舉', 'Enumeration')
on conflict (slug) do update set
  label_zh = excluded.label_zh,
  label_en = excluded.label_en;

insert into public.problems (
  id, title, summary, description, input_format, output_format,
  constraints_text, starter_code, difficulty, time_limit_ms,
  memory_limit_mb, published
) values (
  'h027',
  '{"zh":"202001_2 矩陣總和","en":"202001_2 Matrix Sum"}',
  '{"zh":"在大矩陣的所有固定大小子矩陣中，尋找與小矩陣足夠接近的候選。","en":"Find fixed-size submatrices that are sufficiently close to a given small matrix."}',
  '[{"zh":"對兩個大小相同的矩陣，將對應位置數值不同的元素個數定義為兩矩陣的距離。","en":"For two matrices of equal size, their distance is the number of corresponding positions containing different values."},{"zh":"給定 s × t 的矩陣 A 與 n × m 的矩陣 B，請計算 B 中有多少個 s × t 子矩陣與 A 的距離不超過 r。","en":"Given an s × t matrix A and an n × m matrix B, count the s × t submatrices of B whose distance from A is at most r."},{"zh":"再從所有符合條件的子矩陣中，找出其元素總和與 A 的元素總和之最小絕對差。若沒有符合條件的子矩陣，最小差輸出 −1。題目來源：2020 年 1 月 APCS，ZeroJudge h027。","en":"Among all qualifying submatrices, find the minimum absolute difference between its element sum and the sum of A. Print −1 for this value when no submatrix qualifies. Source: January 2020 APCS, ZeroJudge h027."}]',
  '{"zh":"第一行包含五個正整數 s、t、n、m、r。接下來 s 行每行包含 t 個整數，表示矩陣 A；再接下來 n 行每行包含 m 個整數，表示矩陣 B。同一行的數字以空白分隔。","en":"The first line contains five positive integers s, t, n, m, and r. The next s rows contain t integers each for matrix A, followed by n rows of m integers each for matrix B. Values on a row are space-separated."}',
  '{"zh":"輸出兩行。第一行是符合條件的子矩陣個數；第二行是這些子矩陣的元素總和與 A 的元素總和之最小絕對差。若沒有符合條件的子矩陣，第二行輸出 −1。","en":"Print two lines. The first is the number of qualifying submatrices. The second is the minimum absolute difference between a qualifying submatrix sum and the sum of A. If none qualifies, print −1 on the second line."}',
  '[{"zh":"1 ≤ s ≤ n ≤ 10","en":"1 ≤ s ≤ n ≤ 10"},{"zh":"1 ≤ t ≤ m ≤ 100","en":"1 ≤ t ≤ m ≤ 100"},{"zh":"1 ≤ r ≤ 100","en":"1 ≤ r ≤ 100"},{"zh":"0 ≤ Aᵢⱼ, Bᵢⱼ ≤ 9","en":"0 ≤ Aᵢⱼ, Bᵢⱼ ≤ 9"}]',
  '{"cpp":"#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}\n","python":"print(\"Hello, World!\")\n"}',
  'medium', 1000, 512, true
)
on conflict (id) do update set
  title = excluded.title,
  summary = excluded.summary,
  description = excluded.description,
  input_format = excluded.input_format,
  output_format = excluded.output_format,
  constraints_text = excluded.constraints_text,
  starter_code = excluded.starter_code,
  difficulty = excluded.difficulty,
  time_limit_ms = excluded.time_limit_ms,
  memory_limit_mb = excluded.memory_limit_mb,
  published = excluded.published;

delete from public.problem_tag_links where problem_id = 'h027';
delete from public.problem_samples where problem_id = 'h027';
delete from public.problem_test_groups where problem_id = 'h027';

insert into public.problem_tag_links (problem_id, tag_slug) values
  ('h027', 'apcs'), ('h027', 'matrix'), ('h027', 'enumeration');

insert into public.problem_samples (problem_id, sample_order, input, output, explanation) values
  ('h027', 1, E'1 3 1 10 1\n7 4 7\n6 7 7 7 4 5 0 4 4 7', E'3\n2', null),
  ('h027', 2, E'3 3 5 5 2\n1 2 1\n2 4 2\n2 4 5\n1 2 1 2 3\n2 4 2 4 2\n2 4 2 3 5\n3 2 4 2 0\n3 2 4 5 5', E'3\n1', null);

insert into public.problem_test_groups (
  problem_id, group_order, name, condition, test_case_count, score_percent
) values
  ('h027', 1, '{"zh":"基本情況","en":"Basic cases"}', '{"zh":"s = n = 1","en":"s = n = 1"}', 6, 50),
  ('h027', 2, '{"zh":"邊界情況","en":"Boundary cases"}', '{"zh":"無額外限制","en":"No additional constraints"}', 8, 50);

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select groups.id, cases.case_order, cases.input, cases.expected_output
from public.problem_test_groups groups
cross join (values
  (1, E'1 3 1 10 1\n7 4 7\n6 7 7 7 4 5 0 4 4 7', E'3\n2'),
  (2, E'1 1 1 1 1\n0\n9', E'1\n9'),
  (3, E'1 4 1 4 1\n1 2 3 4\n1 2 3 4', E'1\n0'),
  (4, E'1 2 1 5 1\n0 9\n0 9 0 9 0', E'2\n0'),
  (5, E'1 3 1 7 100\n9 9 9\n0 0 0 0 0 0 0', E'5\n27'),
  (6, E'1 3 1 6 1\n1 1 1\n1 1 2 1 1 1', E'4\n0')
) as cases(case_order, input, expected_output)
where groups.problem_id = 'h027' and groups.group_order = 1;

insert into public.problem_test_cases (group_id, case_order, input, expected_output)
select groups.id, cases.case_order, cases.input, cases.expected_output
from public.problem_test_groups groups
cross join (values
  (1, E'3 3 5 5 2\n1 2 1\n2 4 2\n2 4 5\n1 2 1 2 3\n2 4 2 4 2\n2 4 2 3 5\n3 2 4 2 0\n3 2 4 5 5', E'3\n1'),
  (2, E'2 2 3 3 1\n0 0\n0 0\n9 9 9\n9 9 9\n9 9 9', E'0\n-1'),
  (3, E'2 3 3 5 1\n1 2 3\n4 5 6\n1 2 3 8 8\n4 5 6 1 2\n1 2 3 4 5', E'1\n0'),
  (4, E'2 2 3 4 100\n0 0\n0 0\n9 9 9 9\n9 9 9 9\n9 9 9 9', E'6\n36'),
  (5, E'2 2 3 3 1\n1 1\n1 1\n1 1 2\n1 1 1\n2 1 1', E'4\n0'),
  (6, E'3 1 4 3 1\n1\n2\n3\n1 9 1\n2 8 2\n3 7 3\n1 2 3', E'2\n0'),
  (7, E'2 3 2 6 2\n9 0 9\n0 9 0\n9 0 8 0 9 0\n0 9 0 9 0 1', E'2\n1'),
  (8, E'10 100 10 100 1\n' || trim(repeat('0 ', 1000)) || E'\n' || trim(repeat('0 ', 1000)), E'1\n0')
) as cases(case_order, input, expected_output)
where groups.problem_id = 'h027' and groups.group_order = 2;
