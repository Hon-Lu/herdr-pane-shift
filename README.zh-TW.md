[English](README.md) | **繁體中文**

# Pane Shift

用鍵盤重新排列 pane 的 [Herdr](https://herdr.dev) plugin。可以把 pane 和相鄰的 pane 交換、拉到獨立的 tab、旋轉分割，或放到任一個 tab 裡任一個 pane 的旁邊。pane 只會被搬移，不會被關閉或重建，裡面正在執行的程式和 agent 都不會中斷。

| 按鍵 | 功能 |
|---|---|
| `prefix+ctrl+←` `↑` `→` `↓` | 把焦點 pane 和該方向的相鄰 pane 交換位置 |
| `prefix+ctrl+t` | 把焦點 pane 拉到新的 tab |
| `prefix+ctrl+r` | 旋轉：把 pane 疊進旁邊那一欄，或從所在的欄抽出來 |
| `prefix+ctrl+p` | 從所有 tab 的 pane 中挑一個，把焦點 pane 放到它的某一側 |

Herdr 預設的 prefix 是 `ctrl+b`，所以 Ctrl 可以一路按住：按住 Ctrl，點 B，再點方向鍵、T、R 或 P。

## 快速開始

### 1. 確認環境

- Herdr 0.9.0 以上
- Node.js 18 以上，並且能在 `PATH` 中以 `node` 執行

沒有其他依賴，也不需要 build。支援 Linux、macOS、Windows。

### 2. 安裝 plugin

```sh
herdr plugin install Hon-Lu/herdr-pane-shift
```

Herdr 會先列出 plugin 會執行的指令，確認後才安裝。

### 3. 加上快捷鍵

Herdr 不允許 plugin 自帶快捷鍵，所以加上這段之前，按鍵不會有任何反應。打開 Herdr 的 `config.toml`：

| 作業系統 | 路徑 |
|---|---|
| Windows | `%APPDATA%\herdr\config.toml` |
| Linux、macOS | `~/.config/herdr/config.toml` |

把下面這段貼到檔案最後：

```toml
[[keys.command]]
key = "prefix+ctrl+left"
type = "plugin_action"
command = "pane-shift.move-left"
description = "move pane left"

[[keys.command]]
key = "prefix+ctrl+up"
type = "plugin_action"
command = "pane-shift.move-up"
description = "move pane up"

[[keys.command]]
key = "prefix+ctrl+right"
type = "plugin_action"
command = "pane-shift.move-right"
description = "move pane right"

[[keys.command]]
key = "prefix+ctrl+down"
type = "plugin_action"
command = "pane-shift.move-down"
description = "move pane down"

[[keys.command]]
key = "prefix+ctrl+t"
type = "plugin_action"
command = "pane-shift.break"
description = "break pane into new tab"

[[keys.command]]
key = "prefix+ctrl+r"
type = "plugin_action"
command = "pane-shift.rotate"
description = "rotate split"

[[keys.command]]
key = "prefix+ctrl+p"
type = "plugin_action"
command = "pane-shift.place"
description = "place pane beside another pane"
```

這些按鍵都沒有被 Herdr 預設功能使用。如果和你自己的設定或其他 plugin 衝突，改掉對應的 `key` 那一行即可。

### 4. 重新載入設定

```sh
herdr server reload-config
```

### 5. 試試看

先分割出一個 pane（`ctrl+b` 再按 `v`），然後按 `ctrl+b`、`ctrl+←`，兩個 pane 就會交換位置。

## 選用：用方向鍵移動焦點

Herdr 預設用 `prefix+h/j/k/l` 移動焦點，`prefix+方向鍵` 則沒有綁定。把方向鍵綁給焦點後，正好和這個 plugin 湊成一組：方向鍵移動焦點，同樣的方向鍵加上 Ctrl 則移動 pane 本身。下面的寫法會保留原本的 `h/j/k/l`：

```toml
[keys]
focus_pane_left = ["prefix+h", "prefix+left"]
focus_pane_down = ["prefix+j", "prefix+down"]
focus_pane_up = ["prefix+k", "prefix+up"]
focus_pane_right = ["prefix+l", "prefix+right"]
```

| 按鍵 | 移動的是 |
|---|---|
| `prefix+←` `↑` `→` `↓` | 焦點 |
| `prefix+ctrl+←` `↑` `→` `↓` | 焦點所在的 pane |

`[keys]` 要放在 `[[keys.command]]` 之前。如果你已經自訂過 `focus_pane_*`，把方向鍵加進自己的清單就好，不要整段覆蓋。

## 旋轉

`rotate` 依照畫面上看到的排與欄判斷，和 Herdr 內部怎麼巢狀分割無關：

| 焦點 pane 的位置 | 旋轉後 |
|---|---|
| 在一排裡，左邊有鄰居 | 疊到左邊鄰居底下，接在那一欄的最下方 |
| 在一排的最左邊 | 疊到右邊鄰居的上方 |
| 在一欄裡，上面有鄰居 | 抽出來自成一欄，放在原本那一欄的右側 |
| 在一欄的最上方 | 抽出來自成一欄，放在左側 |

「疊進去」和「抽出來」互為反向，所以同一個 pane 再旋轉一次就會回到原位。從一欄抽出來的 pane 會依格數分到那一欄的寬度（三格中抽出一格就拿 1/3）。

```
焦點在 C             旋轉                焦點在 A             旋轉
┌─────┬─────┐        ┌───────────┐       ┌─────┬─────┐        ┌───┬───┬───┐
│  A  │     │        │     A     │       │  A  │     │        │   │   │   │
├─────┤  C  │   →    ├───────────┤       ├─────┤  C  │   →    │ A │ B │ C │
│  B  │     │        │     B     │       │  B  │     │        │   │   │   │
└─────┴─────┘        ├───────────┤       └─────┴─────┘        └───┴───┴───┘
                     │     C     │
                     └───────────┘
```

## 放置

`place` 會跳出一個 popup，依 workspace 和 tab 分組列出所有 pane，目前所在的 workspace 排在最前面。每一列顯示 pane ID、agent 與狀態、pane 名稱和工作目錄。

1. 用 `↑` `↓` 選要放在哪個 pane 旁邊，按 `Enter` 確定
2. 用 `←` `↑` `→` `↓` 選放在哪一側，按下就會立即搬移

`Esc` 可以回到上一步，在清單畫面按則會關閉 popup。選定方向之前不會有任何變動。

也可以用滑鼠操作：滾輪捲動清單，點一下選取 pane、再點一次確認，底部的方向按鈕可以直接點，右鍵等同 `Esc`。

## 疑難排解

**按了沒反應。** 先確認 action 有沒有被執行：

```sh
herdr plugin log list --plugin pane-shift --limit 5
```

- 沒有新紀錄：按鍵沒有送到 Herdr。確認快捷鍵已經加入設定並重新載入。有些終端機或編輯器會把 Ctrl+方向鍵留給自己用（例如 VS Code 的內建終端機），請在那邊釋放這組按鍵，或改用其他按鍵。
- 有 `failed` 紀錄：訊息會說明原因，例如那個方向沒有 pane。

**有時有效、有時沒反應。** prefix 只要按一次。在 prefix 模式下再按一次 `ctrl+b`，會把 `^B` 送進 pane 並離開 prefix 模式，接下來的按鍵就會直接送進 pane。

**錯誤訊息。** 會以 Herdr 通知顯示，也會寫進上面的 plugin log。

自訂按鍵時避免使用 `prefix+ctrl+m`：終端機送出的 Ctrl+M 等同 Enter。

## 運作方式

每個 action 也都能從 CLI 執行，作用在 Herdr 目前焦點所在的 pane：

```sh
herdr plugin action invoke pane-shift.rotate
```

被搬移的 pane 只有在原本就有焦點時才會保留焦點，所以從 CLI 或其他 client 觸發時，不會把你的畫面帶走。搬移後變空的 tab 會由 Herdr 自動關閉。

`herdr pane move` 只能把 pane 放在目標的右側或下方，而且會忽略同一個 tab 內的移動。`rotate` 和 `place` 的做法是：先從 `herdr pane layout` 讀出分割樹，把受影響的 pane 暫時移到一個暫存 tab，再依新的排列逐一搬回來。暫存 tab 會自動關閉，不過 tab 列上可能會閃一下。

## 開發

改用本地資料夾 link，而不是從 GitHub 安裝，修改後就會立即生效：

```sh
herdr plugin uninstall pane-shift
herdr plugin link /path/to/herdr-pane-shift
```

## 授權

以 [MIT 授權](LICENSE) 釋出，可以自由使用、修改與散布。
