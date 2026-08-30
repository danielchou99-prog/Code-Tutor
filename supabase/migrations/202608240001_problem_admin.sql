-- Code Tutor: trusted problem administration permissions and formal story titles.

grant select, insert, update, delete on public.problems,
  public.problem_tags, public.problem_tag_links, public.problem_samples,
  public.problem_test_groups, public.problem_test_cases to service_role;

update public.problems set
  title = '{"zh":"星際補給站","en":"Orbital Supply Depot"}',
  summary = '{"zh":"合併兩批送達太空站的補給數量。","en":"Combine two supply shipments delivered to an orbital station."}',
  description = '[{"zh":"兩艘運輸船分別帶來 A 與 B 箱補給品。請計算太空站本次總共收到多少箱補給品。","en":"Two cargo ships deliver A and B supply crates. Calculate the total number of crates received by the station."}]',
  input_format = '{"zh":"一行包含兩個以空白分隔的整數 A 與 B，代表兩艘運輸船的補給箱數。","en":"One line contains two space-separated integers A and B, the crate counts from the two ships."}',
  output_format = '{"zh":"輸出一個整數，代表太空站收到的補給品總數。","en":"Print one integer: the total number of supply crates."}'
where id = '1001';

update public.problems set
  title = '{"zh":"古老書庫","en":"The Ancient Archive"}',
  summary = '{"zh":"在依編號排列的書架中找出指定古籍最早的位置。","en":"Find the earliest shelf position of a requested volume in a sorted archive."}',
  description = '[{"zh":"古老書庫的 N 本典籍依編號由小到大排列，館員要尋找編號 X。請輸出 X 第一次出現的位置。","en":"The archive stores N volumes in nondecreasing order by catalog number. Find the first position where catalog number X appears."},{"zh":"如果書庫中沒有編號 X，請輸出 −1。位置從 0 開始計算。","en":"If catalog number X is absent, print −1. Positions are zero-indexed."}]',
  input_format = '{"zh":"第一行包含 N 與 X。第二行包含 N 個由小到大排列的典籍編號。","en":"The first line contains N and X. The second line contains N catalog numbers in sorted order."}',
  output_format = '{"zh":"輸出編號 X 第一次出現的位置；若不存在則輸出 −1。","en":"Print the first position of X, or −1 if it does not exist."}'
where id = '1002';

update public.problems set
  title = '{"zh":"迷霧森林","en":"Forest of Mist"}',
  summary = '{"zh":"找出旅人穿越森林抵達出口所需的最少步數。","en":"Find the fewest steps needed for a traveler to reach the forest exit."}',
  description = '[{"zh":"森林地圖由 H × W 個格子組成，S 是旅人的起點、E 是出口、# 是無法通行的岩壁、. 是可行走的道路。","en":"The forest is an H × W grid. S is the traveler, E is the exit, # is an impassable rock, and . is open ground."},{"zh":"旅人每一步可以往上、下、左、右移動一格。請計算抵達出口的最少步數。","en":"The traveler may move one cell up, down, left, or right. Find the minimum number of steps needed to reach the exit."}]',
  input_format = '{"zh":"第一行包含 H 與 W，接下來 H 行為森林地圖。","en":"The first line contains H and W, followed by H rows describing the forest."}',
  output_format = '{"zh":"輸出抵達出口的最少步數；如果無法抵達，輸出 −1。","en":"Print the minimum number of steps, or −1 if the exit is unreachable."}'
where id = '1003';

update public.problems set
  title = '{"zh":"彗星撞擊","en":"Comet Impact"}',
  summary = '{"zh":"從連續觀測紀錄中找出能量最強的一段撞擊期。","en":"Find the strongest impact period in a sequence of energy observations."}',
  description = '[{"zh":"觀測站記錄了連續 N 個時段的能量變化 Ai。請找出一段非空的連續時段，使其中的能量變化總和最大。","en":"An observatory records energy changes Ai over N consecutive periods. Find a non-empty consecutive interval with the maximum total energy change."}]',
  input_format = '{"zh":"第一行包含 N。第二行包含 N 個整數，依序代表每個時段的能量變化。","en":"The first line contains N. The second line contains N integers describing the energy change in each period."}',
  output_format = '{"zh":"輸出能量變化總和最大的連續時段之總和。","en":"Print the maximum total energy change over a consecutive interval."}'
where id = '1004';
