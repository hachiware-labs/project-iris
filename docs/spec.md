# Project Iris

要件とは、Project Iris が満たすべき観測可能な振る舞いを、レビュー者が確認できる粒度で定義するものである。各要件は Given/When/Done で正常系を示し、エラー分岐は ERR/MSG ID で管理する。I/F 詳細や外部 API の細部はここでは定義しない。

# 要件一覧（Requirements）
| ID | 要件（固定書式・正常系のみ） | 関連UC-ID |
|---|---|---|
| REQ-0001 | 管理領域を初期化したら、Project Iris が読むローカル scaffold を作成する。 | UC-1 |
| REQ-0002 | GitHub Issues を取り込んだら、Issue を provider_refs つき Task として WBS に追加または更新する。 | UC-2 |
| REQ-0003 | Excel WBS を取り込んだら、Excel 行を provider_refs つき Task として WBS に追加または更新する。 | UC-2 |
| REQ-0004 | 現在状態を表示したら、WBS の status/owner/blocked/high priority open を集計して表示する。 | UC-3 |
| REQ-0005 | プロジェクトを分析したら、支援判断に必要な finding をルールベースで出力する。 | UC-4 |
| REQ-0006 | snapshot を取得したら、現在状態の履歴を日付つきで保存する。 | UC-5 |
| REQ-0007 | burndown を表示したら、snapshot 履歴から残作業推移と見通しを表示する。 | UC-5 |
| REQ-0008 | report を生成したら、進捗見通し、リスク、支援候補、よい進捗シグナル、次アクションを Markdown として出力する。 | UC-6 |
| REQ-0009 | 人に関する分析を出力したら、個人評価ではなく支援判断として表現する。 | UC-4, UC-6 |
| REQ-0010 | focus を表示したら、プロジェクトが今見るべき焦点を優先順で出力する。 | UC-7 |

### [PIRIS-0001] 管理領域を初期化したら、Project Iris が読むローカル scaffold を作成する。
Given：ユーザーが Project Iris を使いたい対象ディレクトリを持っている。
When：ユーザーが `iris init` を実行する。
Done：対象ディレクトリに `.planwise/project.yaml`、`.planwise/wbs.yaml`、`.planwise/providers.yaml`、`.planwise/rubrics/default.yaml` が作成される。

#### エラー分岐（REQ-0001の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0001 | `.planwise` が既に存在し、上書き指定がない | `--force` を指定するか、既存ファイルを確認する | MSG-PIRIS-0001 |

### [PIRIS-0002] GitHub Issues を取り込んだら、Issue を provider_refs つき Task として WBS に追加または更新する。
Given：`.planwise/wbs.yaml` が存在し、対象 GitHub repository が指定されている。
When：ユーザーが `iris import github --repo owner/name` を実行する。
Done：GitHub Issue が Task に変換され、`provider_refs` に provider、repo、issue number、URL、timestamps を保持して WBS に保存される。

#### エラー分岐（REQ-0002の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0002 | repository 指定が `owner/name` 形式ではない | 正しい repository 名を指定する | MSG-PIRIS-0002 |
| ERR-PIRIS-0003 | GitHub API が権限不足または取得失敗を返す | `GITHUB_TOKEN` と repository 権限を確認する | MSG-PIRIS-0003 |
| ERR-PIRIS-0004 | 取り込み後の WBS が検証に失敗する | エラー内容に従って WBS または provider データを修正する | MSG-PIRIS-0004 |

### [PIRIS-0003] Excel WBS を取り込んだら、Excel 行を provider_refs つき Task として WBS に追加または更新する。
Given：`.planwise/wbs.yaml` が存在し、読み取り可能な `.xlsx` ファイルがある。
When：ユーザーが `iris import excel --path file.xlsx` を実行する。
Done：Excel の各行が Task に変換され、`provider_refs` に provider、path、row を保持して WBS に保存される。

#### エラー分岐（REQ-0003の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0005 | `--path` が指定されていない、またはファイルを読めない | 正しい `.xlsx` パスを指定する | MSG-PIRIS-0005 |
| ERR-PIRIS-0006 | Excel に title/task/name/summary 相当の列がない | サポート対象ヘッダーを追加する | MSG-PIRIS-0006 |
| ERR-PIRIS-0007 | 取り込み後の WBS が検証に失敗する | 重複 ID や依存関係を修正する | MSG-PIRIS-0007 |

### [PIRIS-0004] 現在状態を表示したら、WBS の status/owner/blocked/high priority open を集計して表示する。
Given：`.planwise/wbs.yaml` が存在し、tasks が検証可能である。
When：ユーザーが `iris status` を実行する。
Done：総タスク数、status 別件数、owner 別件数、blocked tasks、urgent/high の未完了 tasks が表示される。

#### エラー分岐（REQ-0004の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0008 | `.planwise/wbs.yaml` が存在しない | `iris init` を実行する | MSG-PIRIS-0008 |
| ERR-PIRIS-0009 | WBS が schema 検証に失敗する | `iris validate` の結果に従って修正する | MSG-PIRIS-0009 |

### [PIRIS-0005] プロジェクトを分析したら、支援判断に必要な finding をルールベースで出力する。
Given：WBS に tasks と必要に応じて provider_refs が存在する。
When：ユーザーが `iris analyze` を実行する。
Done：blocked、依存ボトルネック、owner なし、高優先度未完了、acceptance 不足、stale、provider 差分が finding として表示される。

#### エラー分岐（REQ-0005の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0010 | 分析に必要なデータが不足している | import または WBS 編集でデータを補う | MSG-PIRIS-0010 |
| ERR-PIRIS-0011 | 日付や provider timestamp が不足し stale 判定できない | stale 判定なしの finding として読む | MSG-PIRIS-0011 |

### [PIRIS-0006] snapshot を取得したら、現在状態の履歴を日付つきで保存する。
Given：WBS が存在し、tasks が検証可能である。
When：ユーザーが `iris snapshot` を実行する。
Done：`.planwise/history/snapshots/YYYY-MM-DD.json` に total、remaining、done、by_status、by_milestone が保存される。

#### エラー分岐（REQ-0006の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0012 | WBS が存在しない、または検証に失敗する | WBS を作成または修正する | MSG-PIRIS-0012 |
| ERR-PIRIS-0013 | 同日の snapshot が既に存在する | 上書き可否を確認して再実行する | MSG-PIRIS-0013 |

### [PIRIS-0007] burndown を表示したら、snapshot 履歴から残作業推移と見通しを表示する。
Given：2件以上の snapshot が存在する。
When：ユーザーが `iris burndown` を実行する。
Done：日付別 remaining、burn rate、必要 burn rate、delivery outlook が表示される。

#### エラー分岐（REQ-0007の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0014 | snapshot が不足している | `iris snapshot` を継続実行する | MSG-PIRIS-0014 |
| ERR-PIRIS-0015 | milestone 指定に該当する履歴がない | milestone 名を確認するか scope を広げる | MSG-PIRIS-0015 |

### [PIRIS-0008] report を生成したら、進捗見通し、リスク、支援候補、よい進捗シグナル、次アクションを Markdown として出力する。
Given：status、analyze、必要に応じて burndown の材料がある。
When：ユーザーが `iris report --format markdown` を実行する。
Done：Executive Summary、Delivery Outlook、Key Risks、People Attention、Positive Signals、Suggested Actions を含む Markdown が出力される。

#### エラー分岐（REQ-0008の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0016 | report に必要な analysis が生成できない | WBS と provider_refs を確認する | MSG-PIRIS-0016 |
| ERR-PIRIS-0017 | burndown 履歴が不足して delivery outlook が出せない | 履歴不足として report を読むか snapshot を蓄積する | MSG-PIRIS-0017 |

### [PIRIS-0009] 人に関する分析を出力したら、個人評価ではなく支援判断として表現する。
Given：Task に owner、assignee、provider_refs、finding が存在する。
When：Project Iris が people attention または support needed を出力する。
Done：出力は「誰を助けるとプロジェクトが前に進むか」「どこに負荷・判断・詰まりがあるか」を示し、個人の能力評価・順位付け・責任追及表現を含まない。

#### エラー分岐（REQ-0009の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0018 | 個人に関する根拠データが不足している | person finding をデータ不足として扱う | MSG-PIRIS-0018 |
| ERR-PIRIS-0019 | 出力が評価・ランキングに見える | 表現を support/attention/recommendation に修正する | MSG-PIRIS-0019 |

### [PIRIS-0010] focus を表示したら、プロジェクトが今見るべき焦点を優先順で出力する。
Given：WBS、status、analysis、必要に応じて snapshot/burndown の材料がある。
When：ユーザーが `iris focus` を実行する。
Done：最重要リスク、支援が必要な人または領域、次アクション、Positive Signals が根拠つきで優先順に表示される。

#### エラー分岐（REQ-0010の枝番）
| ERR-ID | 発生条件 | ユーザーアクション | 関連MSG-ID |
|---|---|---|---|
| ERR-PIRIS-0020 | focus に必要な analysis が不足している | `iris analyze` または import を実行する | MSG-PIRIS-0020 |
| ERR-PIRIS-0021 | 複数の焦点候補を順位づける根拠が不足している | 同順位または根拠不足として読む | MSG-PIRIS-0021 |

## メッセージID管理（MSG-xxxx）
| ID | 文面テンプレ | 出力先 | 発生条件 | 関連REQ/ERR |
|---|---|---|---|---|
| MSG-PIRIS-0001 | `.planwise already exists. Use --force to overwrite.` | stderr | 既存 scaffold がある | REQ-0001 / ERR-PIRIS-0001 |
| MSG-PIRIS-0002 | `--repo is required and must use owner/name` | stderr | GitHub repo 指定不正 | REQ-0002 / ERR-PIRIS-0002 |
| MSG-PIRIS-0003 | `GitHub request failed: {status}` | stderr | GitHub API 取得失敗 | REQ-0002 / ERR-PIRIS-0003 |
| MSG-PIRIS-0004 | `Cannot save invalid WBS: {errors}` | stderr | GitHub import 後の WBS 不整合 | REQ-0002 / ERR-PIRIS-0004 |
| MSG-PIRIS-0005 | `--path is required` | stderr | Excel path 不足または読取不能 | REQ-0003 / ERR-PIRIS-0005 |
| MSG-PIRIS-0006 | `Excel sheet must include a title/task/name/summary column` | stderr | Excel header 不足 | REQ-0003 / ERR-PIRIS-0006 |
| MSG-PIRIS-0007 | `Cannot save invalid WBS: {errors}` | stderr | Excel import 後の WBS 不整合 | REQ-0003 / ERR-PIRIS-0007 |
| MSG-PIRIS-0008 | `.planwise/wbs.yaml does not exist. Run iris init first.` | stderr | WBS 未作成 | REQ-0004 / ERR-PIRIS-0008 |
| MSG-PIRIS-0009 | `.planwise/wbs.yaml is invalid: {errors}` | stderr | WBS schema 不正 | REQ-0004 / ERR-PIRIS-0009 |
| MSG-PIRIS-0010 | `Analysis skipped: required data is missing.` | stdout/stderr | 分析データ不足 | REQ-0005 / ERR-PIRIS-0010 |
| MSG-PIRIS-0011 | `Stale analysis unavailable: timestamps are missing.` | stdout | timestamp 不足 | REQ-0005 / ERR-PIRIS-0011 |
| MSG-PIRIS-0012 | `Snapshot failed: WBS is missing or invalid.` | stderr | snapshot 前提不成立 | REQ-0006 / ERR-PIRIS-0012 |
| MSG-PIRIS-0013 | `Snapshot already exists for {date}.` | stderr | 同日 snapshot 重複 | REQ-0006 / ERR-PIRIS-0013 |
| MSG-PIRIS-0014 | `Burndown requires at least two snapshots.` | stderr | 履歴不足 | REQ-0007 / ERR-PIRIS-0014 |
| MSG-PIRIS-0015 | `No snapshots found for milestone {milestone}.` | stderr | milestone scope 履歴なし | REQ-0007 / ERR-PIRIS-0015 |
| MSG-PIRIS-0016 | `Report generation failed: analysis data is unavailable.` | stderr | report 材料不足 | REQ-0008 / ERR-PIRIS-0016 |
| MSG-PIRIS-0017 | `Delivery outlook unavailable: burndown history is insufficient.` | stdout | burndown 履歴不足 | REQ-0008 / ERR-PIRIS-0017 |
| MSG-PIRIS-0018 | `People attention is limited because person data is missing.` | stdout | 人に関する根拠不足 | REQ-0009 / ERR-PIRIS-0018 |
| MSG-PIRIS-0019 | `People findings must be phrased as support recommendations.` | stderr | 表現ポリシー違反 | REQ-0009 / ERR-PIRIS-0019 |
| MSG-PIRIS-0020 | `Focus unavailable: analysis data is missing.` | stderr | focus 材料不足 | REQ-0010 / ERR-PIRIS-0020 |
| MSG-PIRIS-0021 | `Focus ranking is limited because evidence is insufficient.` | stdout | focus 順位根拠不足 | REQ-0010 / ERR-PIRIS-0021 |

## エラーID管理（ERR-xxxx）
| ID | 原因 | 検出条件 | ユーザーアクション | 再試行可否 | 関連MSG-ID | 関連REQ |
|---|---|---|---|---|---|---|
| ERR-PIRIS-0001 | 既存 scaffold の保護 | `.planwise` が存在し `--force` がない | 既存内容を確認し、必要なら `--force` を使う | 可 | MSG-PIRIS-0001 | REQ-0001 |
| ERR-PIRIS-0002 | GitHub repo 指定不正 | `owner/name` 形式でない | 正しい repo を指定する | 可 | MSG-PIRIS-0002 | REQ-0002 |
| ERR-PIRIS-0003 | GitHub API 取得失敗 | API response が success でない | token と権限を確認する | 可 | MSG-PIRIS-0003 | REQ-0002 |
| ERR-PIRIS-0004 | GitHub import 後の WBS 不整合 | save 前 validation が失敗する | WBS と provider mapping を修正する | 可 | MSG-PIRIS-0004 | REQ-0002 |
| ERR-PIRIS-0005 | Excel file 指定不正 | path 未指定または読取不能 | 正しい `.xlsx` を指定する | 可 | MSG-PIRIS-0005 | REQ-0003 |
| ERR-PIRIS-0006 | Excel header 不足 | title 相当列がない | header を追加する | 可 | MSG-PIRIS-0006 | REQ-0003 |
| ERR-PIRIS-0007 | Excel import 後の WBS 不整合 | save 前 validation が失敗する | ID や depends_on を修正する | 可 | MSG-PIRIS-0007 | REQ-0003 |
| ERR-PIRIS-0008 | WBS 未作成 | `.planwise/wbs.yaml` が存在しない | `iris init` を実行する | 可 | MSG-PIRIS-0008 | REQ-0004 |
| ERR-PIRIS-0009 | WBS schema 不正 | load/validate が失敗する | エラー箇所を修正する | 可 | MSG-PIRIS-0009 | REQ-0004 |
| ERR-PIRIS-0010 | 分析データ不足 | 必須 field が不足する | import または WBS 編集で補う | 可 | MSG-PIRIS-0010 | REQ-0005 |
| ERR-PIRIS-0011 | stale 判定不能 | timestamp がない | stale 以外の finding を確認する | 可 | MSG-PIRIS-0011 | REQ-0005 |
| ERR-PIRIS-0012 | snapshot 前提不成立 | WBS が存在しないか不正 | WBS を作成または修正する | 可 | MSG-PIRIS-0012 | REQ-0006 |
| ERR-PIRIS-0013 | 同日 snapshot 重複 | 同じ日付の snapshot がある | 上書き方針を指定する | 可 | MSG-PIRIS-0013 | REQ-0006 |
| ERR-PIRIS-0014 | burndown 履歴不足 | snapshot が2件未満 | snapshot を蓄積する | 可 | MSG-PIRIS-0014 | REQ-0007 |
| ERR-PIRIS-0015 | milestone 履歴なし | 指定 milestone の snapshot がない | milestone 名または scope を確認する | 可 | MSG-PIRIS-0015 | REQ-0007 |
| ERR-PIRIS-0016 | report 材料不足 | analysis が生成できない | WBS/provider_refs を補う | 可 | MSG-PIRIS-0016 | REQ-0008 |
| ERR-PIRIS-0017 | delivery outlook 不足 | burndown 履歴が足りない | 履歴不足として読むか snapshot を蓄積する | 可 | MSG-PIRIS-0017 | REQ-0008 |
| ERR-PIRIS-0018 | person data 不足 | owner/assignee/comment/event が不足する | finding の根拠不足を受け入れる | 可 | MSG-PIRIS-0018 | REQ-0009 |
| ERR-PIRIS-0019 | 表現ポリシー違反 | 個人評価・ランキング表現が出る | support/attention 表現へ修正する | 可 | MSG-PIRIS-0019 | REQ-0009 |
| ERR-PIRIS-0020 | focus 材料不足 | analysis がない、または WBS が不足する | import/analyze を実行する | 可 | MSG-PIRIS-0020 | REQ-0010 |
| ERR-PIRIS-0021 | focus 順位根拠不足 | finding の severity や evidence が不足する | 同順位または根拠不足として読む | 可 | MSG-PIRIS-0021 | REQ-0010 |
