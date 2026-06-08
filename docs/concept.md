# concept.md（最新版）
#1.概要（Overview）（先頭固定）
- 作るもの（What）：Project Iris は、GitHub Issues、Excel WBS、将来の各種プロジェクト管理ツールからプロジェクト情報を取り込み、PM が毎日読む HTML レポートとして、主な進捗、現在地、進捗見通し、詰まり、支援が必要な箇所に焦点を合わせる Codex Skill である。
- 解決すること（Why）：プロジェクト情報が複数ツールに分散すると、進捗が間に合いそうか、どの Issue に詰まりや判断待ちがあるか、チームとしてどの課題を助けると前に進むかが見えにくくなる。Project Iris は分散した作業シグナルを共通 WBS に寄せ、プロジェクトが今見るべき焦点を事実ベースで示す。
- できること（主要機能の要約）：最終提供形は Project Iris Skill であり、Codex からプロジェクト状況を読み取り、日次 HTML レポートを生成する。現行 CLI はローカル `.planwise` 初期化、WBS 読み書き、GitHub/GitLab/Excel 取り込み、Excel export、現在状態の集計、sync preview/apply を提供する内部実行エンジンとして扱う。分析・スナップショット・バーンダウン・焦点提示・支援判断レポート生成は Skill が使う部品として計画する。
- 使いどころ（When/Where）：複数ツールでタスク管理している PM、プロジェクトリード、開発リードが、毎朝の状況把握、週次レビュー、リリース前確認、日程変更の確認、支援依頼、AI エージェントへの状況共有を行う場面で使う。
- 成果物（Outputs）：主成果物は `.planwise/reports/daily/YYYY-MM-DD.html` と根拠 JSON である。内部データとして `.planwise/wbs.yaml`、provider_refs つきタスク、Excel WBS ファイル、同期差分、snapshot 履歴を保存し、必要に応じて CLI 出力も補助的に生成する。
- 前提（Assumptions）：初期実装には Node.js 18+ のローカル CLI を使えるが、最終的なユーザー体験は Codex Skill として提供する。データはユーザーの作業ディレクトリ内に保存する。GitHub Issue の標準開始日は存在しないため、開始日は GitHub Projects や外部シート由来の provider-specific データとして扱う。個人の人事評価ではなく、私たちチームがプロジェクト課題に向き合うための支援判断とプロジェクト前進を目的にする。
- 配布イメージ（Distribution）：Project Iris Skill は Vercel Skills や Clawhub のような Skill カタログに登録され、ユーザーが Codex に追加して使う形を想定する。PM は CLI コマンドではなく「今日のプロジェクト状況をレポートして」「主な進捗と詰まりを見せて」のような対話で起動する。リポジトリ内では `skills/project-iris/` を installable Skill package として管理する。

#2.ユーザーの困りごと（Pain）
- P-1: GitHub、Excel、将来の Jira/Linear/Notion などで作業情報が分散し、プロジェクトの現在地をすぐ説明できない。
- P-2: Issue 数や担当者別件数は見えるが、どの Issue や課題を助けると進捗が改善するかが分からない。
- P-3: blocked、依存関係、未更新、高優先度、受け入れ条件不足が混ざり、間に合いそうかを判断しにくい。
- P-4: バーンダウンや進捗推移を見たいが、Excel と GitHub をまたいだ履歴が残っていない。
- P-5: AI にプロジェクト状況を読ませたいが、入力データの根拠・権限・公開範囲が曖昧だと信頼しにくい。
- P-6: 「よくやっている」は人の活躍として伝え、「助けてほしい」は Issue やプロジェクト課題として伝えたいが、個人評価や責任追及に見える表現は避けたい。
- P-7: 情報は多いが、プロジェクトが今どこに焦点を合わせるべきかを一言で説明できない。
- P-8: PM が日程変更、優先度変更、状態変更を Excel WBS などで整理したいが、SaaS 上の Issue と手作業で同期すると差分や上書きが怖い。
- P-9: PM が毎日プロジェクト状況を確認したいが、Issue 更新・Excel 差分・進捗シグナルを手作業で読んで日次レポート化するのは負荷が高い。

#3.ターゲットと前提環境（詳細）
- 主対象：PM、プロジェクトリード、開発リード。特に、分散した Issue や WBS からプロジェクト状況を説明し、日程変更や優先度調整を安全に扱う層を主対象にする。
- 利用環境：Node.js 18+、npm、ローカルファイルシステム、GitHub API、Excel `.xlsx` ファイル。
- 入力データ：`.planwise/wbs.yaml`、GitHub Issues、Excel WBS、将来の provider データ。
- 権限方針：GitHub の private repository は `GITHUB_TOKEN` を使う。必要最小権限の read access を前提とし、トークンは `.planwise` に保存しない。
- 保存方針：正規化済みの WBS、分析履歴、日次 HTML/JSON レポートはローカル `.planwise` 配下に保存する。外部 provider の原文は必要なメタデータと参照 URL に絞る。
- 公開範囲：Skill が生成する HTML レポート、Markdown レポート、根拠 JSON、補助的な CLI 出力はユーザーが明示的に共有する成果物であり、自動公開しない。
- 例外方針：provider 取得失敗、権限不足、Excel カラム不足、WBS 不整合、履歴不足は、分析を捏造せず「判断不能」または「データ不足」として扱う。
- プロダクト軸：Iris は Integrated Reporting & Insight System の意味を持つ。情報を集めるだけでなく、レンズのように焦点を合わせ、見るべきリスク・支援すべき課題・よい進捗シグナルを選び出す。
- 表現方針：Project Iris は「私たちチーム vs プロジェクト課題」の構図で状況を説明する。活躍や主な進捗は人の貢献として扱い、問題や停滞は人ではなく Issue、依存関係、判断待ち、未確定事項などのプロジェクト課題として扱う。
- 同期方針：Project Iris は外部 SaaS の正本を置き換えない。GitHub などの System of Record を読み、PM が日程変更・優先度変更・状態変更を確認しやすいローカル Excel WBS を作業ビューとして生成・更新する。SaaS へ書き戻す場合は差分 preview と明示的な apply を必須にし、状況把握と計画調整を支える補助機能として扱う。
- レポート方針：Project Iris の主成果物は PM が毎日読む HTML レポートである。Project Iris Skill が Codex のオートメーションから定期実行され、事実データ、snapshot、sync diff、provider_refs を根拠に、イシュー概況、未完了イシュー バーンダウン、今日の焦点、主な進捗、注目すべきイシュー、日程・見通し、次アクションを出力する。
- メッセージ方針：主な進捗には、薄い褒めとして控えめな肯定メッセージを添える。今日の焦点には、Issue を進める人がやりにくい点、追加で確認をもらうとよい相手や領域、判断を先に整えるべき点を、責任追及ではなく支援コメントとして添える。
- スコープ方針：プロジェクト管理を GitHub/GitLab label で行っている場合、日次レポートは `label:release` や `label:website` のような対象 label で絞り込める。レポートには対象 scope を明示し、全体 Issue と label 限定 Issue を混同しない。
- 重要イシュー方針：blocked として扱われている Issue、または他 Issue の依存先になっている Issue は重要イシューとして扱い、今日の焦点と注目すべきイシューで優先表示する。注目すべきイシューは未完了全件ではなく、blocked、他 Issue の依存先、または長く更新がない Issue に絞る。
- LLM 判断方針：Project Iris Skill は Issue の title/body/labels/provider_refs/snapshot を LLM に読ませ、Issue が何の課題か、なぜ PM が見るべきか、次に何を判断すべきかを内容ベースで判断する。CLI は根拠データの収集と deterministic な補助判定を担い、LLM 判断は根拠 JSON として保存して HTML に反映する。
- 対話方針：ユースケースは CLI のコマンド列ではなく、PM と Codex の対話として設計する。Skill は不足データ、同期リスク、根拠不足、公開範囲を会話内で確認し、必要な内部コマンドだけを実行する。

#4.採用する技術スタック（採用理由つき）
- Codex Skill：最終提供形。PM がコマンドを覚えなくても、日次レポート生成、根拠確認、表現ポリシー適用、次アクション整理を Codex に依頼できる。
- Skill Catalog：Vercel Skills や Clawhub のような Skill 登録先。Project Iris Skill を発見・追加・更新できる配布面として扱う。`skills/project-iris/SKILL.md` と `skills/project-iris/agents/openai.yaml` をカタログ登録の最小単位にする。
- Node.js CLI：Skill が内部で呼ぶ deterministic な実行エンジン。GitHub API、ローカルファイル、npm 配布との相性がよく、既存実装も CommonJS ベースで小さく保てる。
- YAML：人が読める WBS 正本として扱いやすく、AI エージェントにも渡しやすい。
- GitHub REST API：Issues の取得・状態・ラベル・担当者・milestone・タイムスタンプを安定して読める。
- read-excel-file：Excel 取り込みを読み取り専用で実装でき、現時点の audit が clean である。
- Markdown：レポート成果物としてレビュー・共有・Git 管理しやすい。
- HTML：PM が毎日読むレポートとして、ブラウザで閲覧しやすく、Issue URL や根拠データへ直接リンクできる。
- LLM Issue 解釈：Skill が Issue 本文を読み、カテゴリ、重要度、注目理由、主な進捗、次アクションを内容ベースで判断する。判断は根拠となる Issue URL、本文要約、timestamp、label、依存関係とともに保存し、根拠のない断定を避ける。
- Deterministic Evidence：CLI が provider_refs、status、timestamp、label、depends_on、snapshot、sync diff などの事実を安定して収集する。LLM 判断が不足する場合の fallback と監査材料として使う。
- Codex オートメーション：日次実行、定期確認、レポート生成の入口として使い、Project Iris Skill を定期実行する。Skill は必要に応じて CLI を内部実行し、事実収集とレポート生成を自動化する。

#5.機能一覧（Features）
## 現行実装済み
| ID | 機能 | 解決するPain | 対応UC |
|---|---|---|---|
| F-1 | `.planwise` 初期化と WBS 正本管理 | P-1, P-5 | UC-1 |
| F-2 | GitHub/GitLab Issues 取り込み | P-1, P-3, P-5 | UC-2 |
| F-3 | Excel WBS 取り込み | P-1, P-4 | UC-2 |
| F-4 | 現在状態の集計 | P-1, P-3 | UC-3 |
| F-12 | WBS の Excel export | P-1, P-8 | UC-8 |
| F-13 | Excel と provider の同期差分 preview | P-5, P-8 | UC-8 |
| F-14 | preview 済みの対応可能差分の provider 書き戻し | P-1, P-8 | UC-9 |

## 計画中
| ID | 機能 | 解決するPain | 対応UC |
|---|---|---|---|
| F-5 | LLM Issue 解釈によるリスク・支援すべき課題の判断 | P-2, P-3, P-6 | UC-4 |
| F-6 | スナップショット履歴 | P-4 | UC-5 |
| F-7 | バーンダウン表示 | P-3, P-4 | UC-5 |
| F-8 | 支援判断レポート生成 | P-2, P-3, P-5, P-6 | UC-6 |
| F-9 | provider 差分・同期リスク検出の分析統合 | P-1, P-5 | UC-4 |
| F-10 | Focus View による「今見るべきこと」の提示 | P-2, P-3, P-7 | UC-7 |
| F-11 | Issue 内容理解に基づく前進シグナルの抽出 | P-6, P-7 | UC-6 |
| F-15 | 日次 HTML レポート生成 | P-2, P-3, P-5, P-6, P-7, P-9 | UC-10 |
| F-16 | Vercel Skills / Clawhub などで配布される Skill と Codex オートメーションからの定期レポート生成 | P-5, P-9 | UC-10 |

#6.ユースケース（Use Cases）
| ID | 主体 | 目的 | 前提 | 対話の開始文例 | Skill の応答/内部処理 | 成功条件 | 例外/制約 |
|---|---|---|---|---|---|---|---|
| UC-1 | プロジェクトリード | Project Iris を使う準備をする | Project Iris Skill が追加済み | 「このリポジトリで Project Iris を使えるようにして」 | Skill が `.planwise` の有無を確認し、必要なら内部 CLI で scaffold を作成する | `.planwise` 配下に project/wbs/providers/rubrics が作成され、次に接続すべき provider を案内する | 既存 `.planwise` がある場合は上書き前に確認する |
| UC-2 | プロジェクトリード | GitHub/GitLab と Excel から WBS にタスクを取り込む | GitHub repo、GitLab project、または Excel ファイルがある | 「この GitHub repo と Excel WBS から状況を読んで」 | Skill が接続先、権限、Excel path を確認し、内部 CLI で import する | provider_refs つき task が `.planwise/wbs.yaml` に追加または更新される | token 不足、Excel ヘッダー不足、重複 ID は会話内で明示する |
| UC-3 | プロジェクトリード | 現在のタスク状態を把握する | WBS が存在する | 「今の状態を短く教えて」 | Skill が WBS を読み、必要なら内部 CLI の status/list/show を使って集計する | status 別件数、owner 件数、blocked、高優先度未完了を、PM が読める短い要約で返す | 履歴や予測は含めず、現在状態として明示する |
| UC-8 | PM / プロジェクトリード | SaaS の Issue をローカル Excel WBS として確認し、日程変更や優先度変更の差分を見る | GitHub などから WBS へ import 済み | 「Excel WBS と GitHub の差分を見せて。日程変更があるか確認したい」 | Skill が Excel export と sync preview を内部実行し、差分とリスクを会話で説明する | provider_refs を保った Excel WBS と、Excel/provider 間の差分が生成される | Excel の手編集は preview で差分確認してから扱う |
| UC-9 | PM / プロジェクトリード | Excel で整理した状態や日程の変更を GitHub/GitLab などへ安全に反映する | Excel WBS と provider_refs がある | 「この変更を GitHub に反映してよいか確認して、問題なければ反映して」 | Skill が preview 結果、対象 field、競合、権限を説明し、ユーザー確認後に内部 CLI で apply する | 保存済み preview のうち provider が対応する差分だけが反映され、結果が WBS に同期される | 破壊的変更、競合、権限不足は apply せず停止する |

## 計画中ユースケース
| ID | 主体 | 目的 | 前提 | 対話の開始文例 | Skill の応答/内部処理 | 成功条件 | 例外/制約 |
|---|---|---|---|---|---|---|---|
| UC-4 | プロジェクトリード | リスクと支援すべき課題を抽出する | WBS と provider_refs がある | 「詰まっていそうな Issue と支援すべき課題を出して」 | Skill が内部分析を実行し、finding を「私たちチーム vs プロジェクト課題」の表現に整える | blocked、他 Issue の依存先、stale、高優先度 owner なし、acceptance 不足、依存ボトルネック、provider 差分が finding として出る | データ不足の場合は断定しない |
| UC-5 | プロジェクトリード | 進捗推移とバーンダウンを見る | 複数日の snapshot がある | 「このままの日程で間に合いそう？」 | Skill が snapshot 履歴と burndown を確認し、見通しと根拠を説明する | 残タスク推移、burn rate、必要 burn rate、見通しが表示される | 履歴不足の場合は予測せず、snapshot 取得を促す |
| UC-6 | プロジェクトリード | 週次・リリース前の支援判断レポートを作る | status/analyze/burndown の材料がある | 「週次レビュー用に、主な進捗とプロジェクト課題をまとめて」 | Skill が分析結果と履歴を読み、Markdown または HTML の支援判断レポートを生成する | 間に合いそうか、主リスク、支援すべき Issue や課題、よい進捗シグナル、次アクションが出る | 活躍は人、問題は Issue や課題として表現し、個人評価ランキングや責任追及表現は出さない |
| UC-7 | プロジェクトリード | 今どこに焦点を合わせるべきかを知る | WBS と分析結果がある | 「今日見るべき焦点を3つに絞って」 | Skill が focus item を選び、根拠 task と推奨アクションを短く返す | 最重要リスク、支援すべき Issue や課題、次アクション、よい進捗シグナルが短く優先順で出る | データ不足や履歴不足がある場合は根拠不足として明示する |
| UC-10 | PM / プロジェクトリード | 毎朝読む日次 HTML レポートを自動生成する | WBS、provider_refs、必要に応じて snapshot と sync diff がある | 「毎朝9時に Project Iris で日次レポートを作って」「release ラベルだけで日次レポートを作って」 | Codex オートメーションが Project Iris Skill を定期実行し、必要に応じて label scope を確認して、Skill が根拠 JSON と HTML を生成する | `.planwise/reports/daily/YYYY-MM-DD.html` と根拠 JSON が生成され、対象 scope、今日の焦点、未完了イシュー バーンダウン、主な進捗、注目すべきイシュー、日程・見通し、次アクションが表示される | 根拠不足の場合は推測せず、データ不足として表示する。label 指定時は対象外 Issue を混ぜない |

#7.Goals（Goalのみ／ユースケース紐づけ必須）
- G-1: 分散したプロジェクト情報をローカル WBS として統合できる。（対応：UC-1, UC-2）
- G-2: プロジェクトの現在状態を短時間で説明できる。（対応：UC-3）
- G-3: リスク、詰まり、支援すべき Issue や課題を事実ベースで検出できる。（対応：UC-4、計画中）
- G-4: 進捗推移と間に合いそうかを履歴から判断できる。（対応：UC-5、計画中）
- G-5: 活躍は人の貢献として示し、問題は Issue やプロジェクト課題として示すことで、支援と次アクションに向いたレポートを作れる。（対応：UC-6、計画中）
- G-6: 分散情報から「今見るべき焦点」を短く説明できる。（対応：UC-7、計画中）
- G-7: SaaS 上の作業情報をローカル Excel WBS として見られる。（対応：UC-8）
- G-8: PM が Excel で整理した状態変更や GitLab due date 変更を差分確認後に安全に provider へ反映できる。（対応：UC-9）
- G-9: PM が毎日読む HTML レポートを、Project Iris Skill と Codex オートメーションから根拠つきで生成できる。（対応：UC-10、計画中）

#8.基本レイヤー構造（Layering）
| レイヤー | 役割 | 主な処理/データ流れ |
|---|---|---|
| Skill 層 | ユーザー操作とオートメーションの入口 | 最終提供形。PM の依頼や Codex オートメーションを受け、必要な import/snapshot/analyze/report/sync の流れを組み立てる |
| CLI 層 | deterministic な内部実行エンジン | 現行は `iris init/import/export/list/show/status/sync/validate` を受け、各サービスに処理を委譲する。`analyze/snapshot/burndown/report/focus` は計画中。最終的には Skill から呼ばれる補助層として扱う |
| Provider Import 層 | 外部ツールの読み取り | GitHub/GitLab Issues や Excel 行を provider_refs つき Task に変換する |
| WBS Core 層 | 正規化データ管理 | `.planwise/wbs.yaml` の読み書き、検証、merge、ID/依存関係チェックを行う |
| Analysis 層 | 現在状態とリスクの検出 | 計画中。status 集計、blocked/stale/priority/owner/acceptance/dependency/provider 差分を deterministic evidence として finding 化する |
| LLM Judgement 層 | Issue 内容の解釈と PM 向け判断 | 計画中。Issue title/body/labels/provider_refs/snapshot を読み、カテゴリ、重要度、注目理由、主な進捗、次アクションを内容ベースで判断する |
| History 層 | 進捗履歴管理 | 計画中。snapshot を保存し、burndown に必要な時系列データを提供する |
| Reporting 層 | 支援判断レポート生成 | 計画中。finding と履歴を HTML/JSON/Markdown/CLI 出力に整形し、支援すべき Issue や課題、よい貢献、次アクションを提示する |
| Automation 層 | 定期実行と成果物管理 | 計画中。Codex オートメーションから Project Iris Skill を起動し、Skill が import/snapshot/analyze/report を組み立て、日次 HTML レポートと根拠 JSON を保存する |
| Focus 層 | 優先焦点の選定 | 計画中。analysis、history、positive signal を統合し、今見るべき上位項目を選ぶ |
| Sync 層 | provider とローカル WBS/Excel の差分管理 | provider_refs を使って差分を検出し、preview と apply に分けて反映する。現行 apply は provider が対応する field に限る |

#9.主要データクラス（Key Data Classes / Entities）
| データクラス | 主要属性（不要属性なし） | 用途（対応UC/Feature） |
|---|---|---|
| Project | id, name, description, owner, status | UC-1 / F-1 |
| Task | id, title, status, priority, owner, labels, milestone, depends_on, acceptance, risks, description, provider_refs | UC-2, UC-3, UC-4, UC-6 / F-2, F-3, F-4, F-5, F-8 |
| ProviderRef | provider, type, repo/project/path, id/row, url, created_at, updated_at, closed_at | UC-2, UC-4 / F-2, F-3, F-9 |
| Finding | id, severity, category, title, evidence, related_tasks, related_people, recommendation | 計画中：UC-4, UC-6 / F-5, F-8 |
| Snapshot | date, scope, total, remaining, done, by_status, by_milestone | 計画中：UC-5, UC-6 / F-6, F-7, F-8 |
| Burndown | scope, start_date, latest_date, remaining_series, burn_rate, required_burn_rate, outlook | 計画中：UC-5, UC-6 / F-7, F-8 |
| Report | generated_at, scope, executive_summary, delivery_outlook, project_issue_attention, contribution_signals, suggested_actions | 計画中：UC-6, UC-10 / F-8, F-15 |
| DailyReport | date, scope, source_snapshot, report_data_path, html_path, open_issue_burndown, focus_items, contribution_signals, project_issue_attention, schedule_attention, suggested_actions | 計画中：UC-10 / F-15, F-16 |
| FocusItem | rank, category, title, reason, evidence, suggested_action, related_tasks, related_people | 計画中：UC-7 / F-10, F-11 |
| SyncDiff | id, provider, direction, field, local_value, remote_value, risk, action | UC-8, UC-9 / F-13, F-14 |
| ExcelWorkbook | path, sheet, columns, task_rows, generated_at | UC-8, UC-9 / F-12, F-13 |

#10.機能部品の実装順序（Implementation Order）
1. 既存の `init/list/show/validate/import/export/status/sync` を維持し、WBS 正本と provider_refs の互換性を固める。
2. `iris analyze` を実装し、blocked、owner なし、高優先度、acceptance 不足、依存ボトルネック、provider 差分を deterministic evidence として検出する。
3. `iris snapshot` を実装し、`.planwise/history/snapshots/YYYY-MM-DD.json` に日次状態を保存する。
4. `iris burndown` を実装し、snapshot 履歴から残タスク推移、burn rate、必要 burn rate、見通しを出す。
5. Project Iris Skill の `SKILL.md` を作成し、Vercel Skills / Clawhub などの Skill カタログで登録される前提の description、対話トリガー、入力確認、表現方針、根拠確認、成果物保存の手順を定義する。
6. Skill から呼べる内部コマンドとして `iris report daily --format html` を実装し、PM が毎日読む日次 HTML レポートと根拠 JSON を生成する。
7. Codex オートメーションから Project Iris Skill を定期実行できるワークフローを整える。
8. `iris report --format markdown` を実装し、分析結果とバーンダウンを「私たちチーム vs プロジェクト課題」の支援判断レポートにまとめる。
9. `iris focus` を実装し、最重要リスク、支援すべき Issue や課題、次アクション、前進シグナルを短い優先リストとして提示する。
10. 既存の `iris export excel` を維持し、provider_refs つき WBS をローカル Excel WBS として生成する。
11. 既存の `iris sync preview` を維持し、Excel/WBS/provider の差分とリスクを表示する。
12. 既存の `iris sync apply` を維持し、保存済み preview のうち provider が対応する差分を provider に書き戻す。差分単位の承認や priority/owner 書き戻しは将来拡張として扱う。
13. GitHub Projects や Issue events から開始日、更新履歴、意思決定シグナルを取り込む。
14. Skill が LLM で Issue 本文を理解し、何の課題か、なぜ重要か、次に何を見るべきかを判断する。判断結果は `.planwise/reports/daily/YYYY-MM-DD.insights.json` のような根拠 JSON として保存し、HTML はその LLM 判断を優先して表示する。

#11.用語集（Glossary）
- Project Iris：複数ツールからプロジェクトの今を見える形にし、見るべき焦点を合わせる Codex Skill。Iris は Integrated Reporting & Insight System の意味を持つ。
- Project Iris Skill：最終提供形。Codex に読み込まれ、PM 向け日次 HTML レポート生成、根拠確認、表現方針適用、次アクション整理を実行する。
- Skill Catalog Entry：Vercel Skills / Clawhub などに登録される Project Iris Skill の表示情報。PM が「日次レポート」「プロジェクト状況」「Issue の詰まり」「主な進捗」などで発見できる説明文を持つ。
- Internal CLI：Project Iris Skill が必要に応じて呼ぶ deterministic なローカル実行エンジン。WBS 読み書き、provider import/export/sync、snapshot、report data 生成を担当する。
- WBS：作業分解構造。Project Iris では `.planwise/wbs.yaml` をローカル正本として扱う。
- provider：GitHub、GitLab、Excel など、タスク情報の入力元。
- provider_refs：Task と外部 provider 上の Issue/行などを結びつける参照情報。
- Finding：分析で検出されたリスク、支援すべき Issue や課題、整合性問題、進捗シグナル。
- Attention：責任追及ではなく、支援や判断が必要な箇所を示す概念。
- 重要イシュー：blocked として扱われている Issue、または他 Issue の依存先になっている Issue。プロジェクト全体の進行を止めやすいため、焦点抽出と注目すべきイシューで優先する。
- Support Needed：誰かが悪いという意味ではなく、助けるとプロジェクトが前に進みやすい状態。
- チーム vs プロジェクト課題：Project Iris の基本的な語り方。チームは課題に向き合い前進させる主体であり、問題は個人ではなく Issue、依存関係、判断待ち、未確定事項などのプロジェクト課題として表現する。
- 前進シグナル：人の活躍や主な進捗を示す事実。Issue の大量 close、大きい・難しい Issue の完了、PR/MR merge、ブロッカー解消、レビュー前進、受け入れ条件の明確化などを、個人評価ではなくチーム前進への貢献として扱う。
- Burndown：snapshot 履歴から残作業の減り方を示す進捗推移。
- Delivery Outlook：現在の残作業、履歴、リスクから見た間に合いそうかの見通し。
- Positive Signal：完了、ブロッカー解消、acceptance 明確化など、プロジェクト前進への貢献を示す事実。前進シグナルと同じ考え方を、主な進捗として表現する用語。
- Daily HTML Report：PM が毎日読む主成果物。対象 scope、イシュー概況、未完了イシュー バーンダウン、今日の焦点、主な進捗、注目すべきイシュー、日程・見通し、次アクションを、根拠 task、Issue URL、snapshot、sync diff とともに HTML で表示する。
- 支援コメント：今日の焦点に添える短いコメント。やりにくい点がないか、誰やどの領域に相談すると進みやすいか、先に合意すべき判断は何かを、個人評価ではなくプロジェクト前進の支援として表現する。
- Label Scope：GitHub/GitLab label などでレポート対象を限定する考え方。プロジェクト管理を label で行っている場合、対象 label の Issue だけを日次レポート、バーンダウン、焦点抽出の母集団にする。
- Report Data JSON：HTML レポートの根拠データ。LLM 入力、再生成、監査のために保存する。
- LLM Insight JSON：Issue 本文を LLM が読んで判断したカテゴリ、重要度、注目理由、主な進捗、次アクション、本文根拠要約を保存する JSON。HTML レポートはこの判断を優先し、不足分は deterministic evidence で補完する。
- Automation Run：Codex オートメーションから Project Iris Skill を定期実行し、日次レポートを生成する実行単位。
- Focus：プロジェクトが今見るべき最重要リスク、支援すべき Issue や課題、よい進捗シグナル、次アクションを短く優先順で示す考え方。
- Local WBS View：SaaS 上の Issue や外部 provider のタスクを、ローカル Excel WBS として確認・編集しやすくしたビュー。
- Sync Preview：Excel/WBS/provider の差分を apply 前に表示し、破壊的変更や競合を避けるための確認結果。
- Sync Apply：preview で確認済みの差分だけを provider へ反映する操作。
