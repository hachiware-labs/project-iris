# concept.md（最新版）
#1.概要（Overview）（先頭固定）
- 作るもの（What）：Project Iris は、GitHub Issues、Excel WBS、将来の各種プロジェクト管理ツールからプロジェクト情報を取り込み、現在地・進捗見通し・詰まり・支援が必要な箇所に焦点を合わせるローカルファースト CLI である。
- 解決すること（Why）：プロジェクト情報が複数ツールに分散すると、進捗が間に合いそうか、誰に負荷や判断が集中しているか、どのタスクを助けると前に進むかが見えにくくなる。Project Iris は分散した作業シグナルを共通 WBS に寄せ、プロジェクトが今見るべき焦点を事実ベースで示す。
- できること（主要機能の要約）：ローカル `.planwise` 初期化、WBS 読み書き、GitHub Issues 取り込み、Excel WBS 取り込み、現在状態の集計、将来の分析・スナップショット・バーンダウン・焦点提示・支援判断レポート生成。
- 使いどころ（When/Where）：複数ツールでタスク管理している個人・小規模チーム・プロジェクトリードが、週次レビュー、リリース前確認、支援依頼、AI エージェントへの状況共有を行う場面で使う。
- 成果物（Outputs）：`.planwise/wbs.yaml`、provider_refs つきタスク、status/analyze/burndown/report の CLI 出力、Markdown レポート、将来の snapshot 履歴。
- 前提（Assumptions）：初期版は Node.js 18+ のローカル CLI とし、データはユーザーの作業ディレクトリ内に保存する。GitHub Issue の標準開始日は存在しないため、開始日は GitHub Projects や外部シート由来の provider-specific データとして扱う。個人の人事評価ではなく、支援判断とプロジェクト前進を目的にする。

#2.ユーザーの困りごと（Pain）
- P-1: GitHub、Excel、将来の Jira/Linear/Notion などで作業情報が分散し、プロジェクトの現在地をすぐ説明できない。
- P-2: Issue 数や担当者別件数は見えるが、誰を助けると進捗が改善するかが分からない。
- P-3: blocked、依存関係、未更新、高優先度、受け入れ条件不足が混ざり、間に合いそうかを判断しにくい。
- P-4: バーンダウンや進捗推移を見たいが、Excel と GitHub をまたいだ履歴が残っていない。
- P-5: AI にプロジェクト状況を読ませたいが、入力データの根拠・権限・公開範囲が曖昧だと信頼しにくい。
- P-6: 「よくやっている」「助けてほしい」を伝えたいが、個人評価や責任追及に見える表現は避けたい。
- P-7: 情報は多いが、プロジェクトが今どこに焦点を合わせるべきかを一言で説明できない。

#3.ターゲットと前提環境（詳細）
- 主対象：プロジェクトリード、PM、開発リード、個人開発者、AI エージェントを使って進行管理する利用者。
- 利用環境：Node.js 18+、npm、ローカルファイルシステム、GitHub API、Excel `.xlsx` ファイル。
- 入力データ：`.planwise/wbs.yaml`、GitHub Issues、Excel WBS、将来の provider データ。
- 権限方針：GitHub の private repository は `GITHUB_TOKEN` を使う。必要最小権限の read access を前提とし、トークンは `.planwise` に保存しない。
- 保存方針：正規化済みの WBS と分析履歴はローカル `.planwise` 配下に保存する。外部 provider の原文は必要なメタデータと参照 URL に絞る。
- 公開範囲：CLI 出力と Markdown レポートはユーザーが明示的に共有する成果物であり、自動公開しない。
- 例外方針：provider 取得失敗、権限不足、Excel カラム不足、WBS 不整合、履歴不足は、分析を捏造せず「判断不能」または「データ不足」として扱う。
- プロダクト軸：Iris は Integrated Reporting & Insight System の意味を持つ。情報を集めるだけでなく、レンズのように焦点を合わせ、見るべきリスク・支援先・よい進捗シグナルを選び出す。

#4.採用する技術スタック（採用理由つき）
- Node.js CLI：GitHub API、ローカルファイル、npm 配布との相性がよく、既存実装も CommonJS ベースで小さく保てる。
- YAML：人が読める WBS 正本として扱いやすく、AI エージェントにも渡しやすい。
- GitHub REST API：Issues の取得・状態・ラベル・担当者・milestone・タイムスタンプを安定して読める。
- read-excel-file：Excel 取り込みを読み取り専用で実装でき、現時点の audit が clean である。
- Markdown：レポート成果物としてレビュー・共有・Git 管理しやすい。
- ルールベース分析：初期段階では AI 生成より先に決定的な検出ルールを置き、結果の再現性と説明可能性を保つ。

#5.機能一覧（Features）
| ID | 機能 | 解決するPain | 対応UC |
|---|---|---|---|
| F-1 | `.planwise` 初期化と WBS 正本管理 | P-1, P-5 | UC-1 |
| F-2 | GitHub Issues 取り込み | P-1, P-3, P-5 | UC-2 |
| F-3 | Excel WBS 取り込み | P-1, P-4 | UC-2 |
| F-4 | 現在状態の集計 | P-1, P-3 | UC-3 |
| F-5 | 分析ルールによるリスク・支援候補検出 | P-2, P-3, P-6 | UC-4 |
| F-6 | スナップショット履歴 | P-4 | UC-5 |
| F-7 | バーンダウン表示 | P-3, P-4 | UC-5 |
| F-8 | 支援判断レポート生成 | P-2, P-3, P-5, P-6 | UC-6 |
| F-9 | provider 差分・同期リスク検出 | P-1, P-5 | UC-4 |
| F-10 | Focus View による「今見るべきこと」の提示 | P-2, P-3, P-7 | UC-7 |
| F-11 | Positive Signals の抽出 | P-6, P-7 | UC-6 |

#6.ユースケース（Use Cases）
| ID | 主体 | 目的 | 前提 | 主要手順（最小操作） | 成功条件 | 例外/制約 |
|---|---|---|---|---|---|---|
| UC-1 | プロジェクトリード | ローカルに Project Iris の管理領域を作る | Node.js と npm が使える | `iris init` を実行する | `.planwise` 配下に project/wbs/providers/rubrics が作成される | 既存 `.planwise` がある場合は `--force` が必要 |
| UC-2 | プロジェクトリード | GitHub と Excel から WBS にタスクを取り込む | GitHub repo または Excel ファイルがある | `iris import github --repo owner/name` または `iris import excel --path file.xlsx` を実行する | provider_refs つき task が `.planwise/wbs.yaml` に追加または更新される | GitHub token 不足、Excel ヘッダー不足、重複 ID は明示エラー |
| UC-3 | プロジェクトリード | 現在のタスク状態を把握する | WBS が存在する | `iris status` を実行する | status 別件数、owner 件数、blocked、高優先度未完了が表示される | 履歴や予測は含めない |
| UC-4 | プロジェクトリード | リスクと支援候補を抽出する | WBS と provider_refs がある | `iris analyze` を実行する | blocked、stale、高優先度 owner なし、acceptance 不足、依存ボトルネック、provider 差分が finding として出る | データ不足の場合は断定しない |
| UC-5 | プロジェクトリード | 進捗推移とバーンダウンを見る | 複数日の snapshot がある | `iris snapshot` を継続実行し、`iris burndown` を実行する | 残タスク推移、burn rate、必要 burn rate、見通しが表示される | 履歴不足の場合は予測せず、snapshot 取得を促す |
| UC-6 | プロジェクトリード | 週次・リリース前の支援判断レポートを作る | status/analyze/burndown の材料がある | `iris report --format markdown` を実行する | 間に合いそうか、主リスク、助けるべき人・タスク、よい進捗シグナル、次アクションが Markdown で出る | 個人評価ランキングや責任追及表現は出さない |
| UC-7 | プロジェクトリード | 今どこに焦点を合わせるべきかを知る | WBS と分析結果がある | `iris focus` または `iris report` を実行する | 最重要リスク、支援先、次アクション、よい進捗シグナルが短く優先順で出る | データ不足や履歴不足がある場合は根拠不足として明示する |

#7.Goals（Goalのみ／ユースケース紐づけ必須）
- G-1: 分散したプロジェクト情報をローカル WBS として統合できる。（対応：UC-1, UC-2）
- G-2: プロジェクトの現在状態を短時間で説明できる。（対応：UC-3）
- G-3: リスク、詰まり、支援候補を事実ベースで検出できる。（対応：UC-4）
- G-4: 進捗推移と間に合いそうかを履歴から判断できる。（対応：UC-5）
- G-5: 人を責めず、支援と次アクションに向いたレポートを作れる。（対応：UC-6）
- G-6: 分散情報から「今見るべき焦点」を短く説明できる。（対応：UC-7）

#8.基本レイヤー構造（Layering）
| レイヤー | 役割 | 主な処理/データ流れ |
|---|---|---|
| CLI 層 | ユーザー操作の入口 | `iris init/import/status/analyze/snapshot/burndown/report` を受け、各サービスに処理を委譲する |
| Provider Import 層 | 外部ツールの読み取り | GitHub Issues や Excel 行を provider_refs つき Task に変換する |
| WBS Core 層 | 正規化データ管理 | `.planwise/wbs.yaml` の読み書き、検証、merge、ID/依存関係チェックを行う |
| Analysis 層 | 現在状態とリスクの検出 | status 集計、blocked/stale/priority/owner/acceptance/dependency/provider 差分を finding 化する |
| History 層 | 進捗履歴管理 | snapshot を保存し、burndown に必要な時系列データを提供する |
| Reporting 層 | 支援判断レポート生成 | finding と履歴を Markdown/CLI 出力に整形し、支援候補と次アクションを提示する |
| Focus 層 | 優先焦点の選定 | analysis、history、positive signal を統合し、今見るべき上位項目を選ぶ |

#9.主要データクラス（Key Data Classes / Entities）
| データクラス | 主要属性（不要属性なし） | 用途（対応UC/Feature） |
|---|---|---|
| Project | id, name, description, owner, status | UC-1 / F-1 |
| Task | id, title, status, priority, owner, labels, milestone, depends_on, acceptance, risks, description, provider_refs | UC-2, UC-3, UC-4, UC-6 / F-2, F-3, F-4, F-5, F-8 |
| ProviderRef | provider, type, repo/path, id/row, url, created_at, updated_at, closed_at | UC-2, UC-4 / F-2, F-3, F-9 |
| Finding | id, severity, category, title, evidence, related_tasks, related_people, recommendation | UC-4, UC-6 / F-5, F-8 |
| Snapshot | date, scope, total, remaining, done, by_status, by_milestone | UC-5, UC-6 / F-6, F-7, F-8 |
| Burndown | scope, start_date, latest_date, remaining_series, burn_rate, required_burn_rate, outlook | UC-5, UC-6 / F-7, F-8 |
| Report | generated_at, scope, executive_summary, delivery_outlook, key_risks, people_attention, positive_signals, suggested_actions | UC-6 / F-8 |
| FocusItem | rank, category, title, reason, evidence, suggested_action, related_tasks, related_people | UC-7 / F-10, F-11 |

#10.機能部品の実装順序（Implementation Order）
1. 既存の `init/list/show/validate/import/status` を維持し、WBS 正本と provider_refs の互換性を固める。
2. `iris analyze` を実装し、blocked、owner なし、高優先度、acceptance 不足、依存ボトルネック、provider 差分をルールベースで検出する。
3. `iris snapshot` を実装し、`.planwise/history/snapshots/YYYY-MM-DD.json` に日次状態を保存する。
4. `iris burndown` を実装し、snapshot 履歴から残タスク推移、burn rate、必要 burn rate、見通しを出す。
5. `iris report --format markdown` を実装し、分析結果とバーンダウンを支援判断レポートにまとめる。
6. `iris focus` を実装し、最重要リスク、支援先、次アクション、Positive Signals を短い優先リストとして提示する。
7. GitHub Projects や Issue events から開始日、更新履歴、意思決定シグナルを取り込む。
8. `iris report --ai` を追加し、ルールベースの事実を自然文に整える。ただし事実検出は deterministic な分析結果を根拠にする。

#11.用語集（Glossary）
- Project Iris：複数ツールからプロジェクトの今を見える形にし、見るべき焦点を合わせる CLI。Iris は Integrated Reporting & Insight System の意味を持つ。
- WBS：作業分解構造。Project Iris では `.planwise/wbs.yaml` をローカル正本として扱う。
- provider：GitHub、Excel など、タスク情報の入力元。
- provider_refs：Task と外部 provider 上の Issue/行などを結びつける参照情報。
- Finding：分析で検出されたリスク、支援候補、整合性問題、進捗シグナル。
- Attention：責任追及ではなく、支援や判断が必要な箇所を示す概念。
- Support Needed：誰かが悪いという意味ではなく、助けるとプロジェクトが前に進みやすい状態。
- Burndown：snapshot 履歴から残作業の減り方を示す進捗推移。
- Delivery Outlook：現在の残作業、履歴、リスクから見た間に合いそうかの見通し。
- Positive Signal：完了、ブロッカー解消、acceptance 明確化など、プロジェクト前進への貢献を示す事実。
- Focus：プロジェクトが今見るべき最重要リスク、支援先、よい進捗シグナル、次アクションを短く優先順で示す考え方。
