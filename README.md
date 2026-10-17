# sing-box-config

这是一个给 Sub-Store 使用的公开 sing-box 配置仓库。

仓库里只有模板、规则和脚本，不保存机场订阅地址、Token、节点密码。

## 你平时只需要维护两个文件

### 1. 自定义规则：`rules/custom.json`

这是你自己的规则，分为三个栏目：

- `direct`：直连
- `proxy`：代理
- `block`：拒绝

可以填写的匹配类型：

- `domain`
- `domain_suffix`
- `domain_keyword`
- `domain_regex`
- `ip_cidr`

示例：[rules/custom.example.json](rules/custom.example.json)

只写“匹配什么”，不要在这里写策略组名、`outbound` 或 `action`。

### 2. 远程规则集列表：`rules/shared/sets.json`

这里放别人仓库提供的规则链接。当前示例引用：

- SagerNet 的国内域名规则
- SagerNet 的国内 IP 规则
- `.lan`、`.local` 直连

以后要增加或更换远程规则集，改这个文件即可。

## 三个设备模板

三个模板都已经监听局域网代理端口 `0.0.0.0:7897`：

- [desktop.json](templates/desktop.json)：macOS、Windows、Ubuntu
- [r5s-openwrt.json](templates/r5s-openwrt.json)：R5S / OpenWrt
- [iphone.json](templates/iphone.json)：iPhone

Desktop 模板可选 TUN；R5S 模板按 OpenWrt 的 fw4/nftables 和 TUN auto_redirect 设计；iPhone 使用系统 VPN/TUN。

`0.0.0.0:7897` 只建议在可信局域网使用，不要把 7897 暴露到公网。

## Sub-Store 设置方法

### 第一步：保存机场订阅

在 Sub-Store 中先添加你的机场订阅。

然后建立一个组合订阅，例如叫：

`我的 sing-box`

这个名称后面要填给脚本。订阅地址和节点信息只保存在 Sub-Store。

### 第二步：添加规则文件

在 Sub-Store 的“文件”中，分别添加下面 6 个远程文件。文件名称请按下表填写：

| Sub-Store 文件名 | Raw 地址 |
|---|---|
| `sb-common` | [common.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/common.json) |
| `sb-shared-sets` | [sets.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/sets.json) |
| `sb-shared-direct` | [direct.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/direct.json) |
| `sb-shared-proxy` | [proxy.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/proxy.json) |
| `sb-shared-block` | [block.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/block.json) |
| `sb-custom` | [custom.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/custom.json) |

其中 `sb-custom` 是你自己的规则文件；你修改 GitHub 上的 `rules/custom.json` 后，Sub-Store 重新读取即可。

### 第三步：添加设备模板

再添加一个远程文件作为模板，三选一：

- macOS / Windows / Ubuntu：[desktop.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/desktop.json)
- R5S / OpenWrt：[r5s-openwrt.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/r5s-openwrt.json)
- iPhone：[iphone.json](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/iphone.json)

模板文件的“脚本操作”使用下面的脚本链接：

[merge.js](https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/sub-store/scripts/merge.js)

### 第四步：填写脚本参数

脚本参数填写为 JSON：

```json
{
  "name": "我的 sing-box",
  "type": "collection",
  "tun": "false",
  "os": "linux"
}
```

说明：

- `name`：你的组合订阅名称
- `type`：组合订阅填 `collection`；单个机场订阅填 `subscription`
- `tun`：桌面模板是否启用 TUN，填 `true` 或 `false`
- `os`：Ubuntu 使用 `linux`；macOS、Windows 不填或删除这一行
- `lanListen`：通常不要填，模板已经是 `0.0.0.0:7897`

脚本默认按上面的 6 个文件名读取文件。如果你使用了别的文件名，可以在参数中补充：

```json
{
  "common": "你的 common 文件名",
  "sets": "你的 sets 文件名",
  "custom": "你的 custom 文件名",
  "shared_direct": "你的 direct 文件名",
  "shared_proxy": "你的 proxy 文件名",
  "shared_block": "你的 block 文件名"
}
```

### 第五步：运行并输出

保存文件和脚本后，在 Sub-Store 运行这个文件，得到最终 sing-box JSON。

按设备选择对应模板：

- 电脑：`desktop.json`
- R5S：`r5s-openwrt.json`
- iPhone：`iphone.json`

最终输出包含节点信息，不要再上传回 GitHub。

## 文件链接总表

仓库地址：[StarrylightLab/sing-box-config](https://github.com/StarrylightLab/sing-box-config)

模板根地址：

`https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/`

规则根地址：

`https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/`

合并脚本：

`https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/sub-store/scripts/merge.js`
