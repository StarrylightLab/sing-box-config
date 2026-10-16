# sing-box-config

Sub-Store 管理订阅；本仓库维护一份共享规则、一份个人规则和三种设备模板。仓库：公开的 [StarrylightLab/sing-box-config](https://github.com/StarrylightLab/sing-box-config)。这里只发布通用模板与不含凭据的规则，机场订阅和最终节点配置保存在 Sub-Store。

## 目录与维护入口

```text
rules/
  custom.json              # 个人规则，只填 direct / proxy / block
  shared/
    common.json            # 公用 DNS、出站与基础配置
    sets.json              # 国内域名/IP 的公开 SRS 来源
    direct.json            # 腾讯/微信等共享直连匹配
    proxy.json             # AI、Google、YouTube、Telegram 等共享代理匹配
    block.json             # 共享拦截列表，默认空
 templates/
  desktop.json             # macOS / Windows / Ubuntu；可选 TUN、LAN 代理共享
  r5s-openwrt.json          # R5S / OpenWrt fw4 + TUN auto_redirect
  iphone.json              # sing-box Apple 客户端的 TUN 配置
sub-store/scripts/merge.js  # 三个平台共用的文件脚本
scripts/verify.mjs          # 离线合并与失败分支检查
 generated/README.md        # 最终配置不提交；由 Sub-Store 分别输出
```

`templates/*.json` 是供本脚本读取的设备片段，不能直接导入 sing-box。脚本合并后才是完整配置。`optional_tun` 是本仓库的模板字段，不会写入最终配置。

采用 sing-box 1.12–1.14 已有字段（新 DNS server 格式、route action、address）。尚未使用目标设备二进制做 `sing-box check`；安装的内核版本应先确认。未来 1.15+ 应重新核对迁移说明，不能保证所有后续版本。`download_detour` 在此版本范围使用；升级到新 HTTP client 下载机制时集中修改共享定义。

## 规则和 DNS

自定义文件示例（仅说明格式，不会默认启用）：

```json
{
  "direct": [{ "domain_suffix": ["example.com"] }],
  "proxy": [{ "domain": ["proxy.example.com"] }],
  "block": [{ "domain": ["ads.example.com"] }]
}
```

允许的匹配字段：`domain`、`domain_suffix`、`domain_keyword`、`domain_regex`、`ip_cidr`，值都为非空字符串数组。规则中不允许 `outbound`、`action`、策略组名或空对象。不同规则为或关系；同时含多个字段的单条规则遵循 sing-box 自身匹配语义。需要 IPv4 和 IPv6 IP 规则时分别填写 CIDR。

顺序：DNS 入口/嗅探/DNS 劫持 → 解析目标地址 → 自定义 block / proxy / direct → 私有 IP 直连 → 共享 block / proxy / direct → `.lan/.local` 直连 → 国内域名/IP 直连 → 默认 proxy。自定义规则优先于共享规则；同一层冲突按 block、proxy、direct 顺序处理。

自定义域名规则也生成对应 DNS 规则。IP 规则只控制连接目的地址，不直接映射 DNS 问题。域名+IP 混合条件也只作用于连接，防止删掉 IP 条件后扩大 DNS 匹配。

默认：223.5.5.5 UDP 供国内/直连解析；Cloudflare DoH 通过 proxy 供其他域名解析；节点域名使用直连解析、IPv4。普通查询当前为 `prefer_ipv4`，没有强制开启国内 IPv6 偏好。局域网域名只设直连，不自动发现你家里的 DNS/主机记录；有内网域名时应按真实内网 DNS 补充，不能靠公共 DNS 解析。

腾讯和代理服务域名是可读的起始列表，并非完整的厂商域名库；Apple、微软等当前依国内规则集/默认出口分流，未强制全局直连。国内 SRS 来自 SagerNet `sing-geosite`、`sing-geoip` 的 `rule-set` 分支。已确认文件存在；下载走 direct，首次直连 GitHub Raw 不通时会影响启动，应先准备可访问的公开镜像或本地缓存，不要把令牌加在 URL 后。

无节点、重复/保留节点名、错误规则会停止输出，不静默回退直连。节点重命名/去重应在 Sub-Store 订阅处理中完成；本脚本不自行改节点名，以免破坏 detour 引用。

## Sub-Store 接入

使用官方文档中的「普通文件 + 文件脚本」，不使用 mihomo 专属覆写，也不调用未经文档说明的后台接口。

本仓库公开，可以通过下表的 GitHub Raw 地址远程读取。Sub-Store 的订阅、组合订阅与最终输出不放到 GitHub。

`rules/custom.json` 默认全空。个人域名/IP 建议直接放在 Sub-Store 的 `sb-custom` 本地内容文件中，避免把个人规则公开。若希望把自定义规则也统一维护在 GitHub，请确认其可公开后再改此文件，并将 `sb-custom` 改为远程读取。

1. 在 Sub-Store 保存机场订阅，再建立一个组合订阅。订阅地址与认证信息始终仅保存在 Sub-Store。
2. 新建以下六个普通文件：前五个来源选「远程」，填下方完整 Raw 地址；`sb-custom` 来源选「本地内容」，复制空的 `rules/custom.json` 后在 Sub-Store 内填写个人规则。保持文件名一致：

| Sub-Store 文件名 | 仓库文件 |
| --- | --- |
| `sb-common` | `rules/shared/common.json` |
| `sb-shared-sets` | `rules/shared/sets.json` |
| `sb-shared-direct` | `rules/shared/direct.json` |
| `sb-shared-proxy` | `rules/shared/proxy.json` |
| `sb-shared-block` | `rules/shared/block.json` |
| `sb-custom` | `rules/custom.json` |

这六个源文件不要挂合并脚本，避免递归调用。

3. 再建立三个普通文件，来源选「远程」，分别填下方设备模板 Raw 地址，作为独立输出：

| 输出文件名 | 远程模板 | 用途 |
| --- | --- | --- |
| `sb-desktop` | `templates/desktop.json` | macOS / Windows / Ubuntu |
| `sb-r5s-openwrt` | `templates/r5s-openwrt.json` | OpenWrt R5S |
| `sb-iphone` | `templates/iphone.json` | iPhone |

4. 三个输出文件的「脚本操作」均使用下方 `merge.js` 远程脚本链接（或粘贴脚本内容），参数填写 `type=collection` 与 `name=实际组合订阅名称`。参数通过编辑页传入 `$arguments`；如使用一个订阅，`type=subscription`。名字包含特殊字符时按 Sub-Store 参数界面/文档做编码，不要填机场订阅 URL。
5. 保存后使用 Sub-Store 界面生成的各自输出链接，分别导入客户端。不要公开分享这些链接；它们可能返回完整节点凭据。本仓库不会存储这些最终链接。

### 完整远程链接

公共文件的 URL 根路径：
`https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/`

| 用途 | 完整 URL |
| --- | --- |
| sb-common | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/common.json |
| sb-shared-sets | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/sets.json |
| sb-shared-direct | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/direct.json |
| sb-shared-proxy | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/proxy.json |
| sb-shared-block | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/shared/block.json |
| 自定义规则初始内容 | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/custom.json |
| sb-desktop 模板 | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/desktop.json |
| sb-r5s-openwrt 模板 | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/r5s-openwrt.json |
| sb-iphone 模板 | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/iphone.json |
| 共用脚本 | https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/sub-store/scripts/merge.js |

远程更新受 GitHub/Sub-Store 缓存影响。需要可复现版本时，把所有 URL 中的 `main` 同时替换为同一个已验证提交 SHA。公开地址不需要 GitHub Token。不要把机场订阅地址或令牌填进本仓库或公开链接。

源文件名可通过脚本参数 `common`、`sets`、`custom`、`shared_direct`、`shared_proxy`、`shared_block` 覆盖。建议第一版直接采用表中名称。

### Desktop

默认仅开 `127.0.0.1:7897` 的 mixed 入口，使用系统代理或客户端手动指定。未默认启动 TUN。

可选 `tun=true` 启动 TUN；Ubuntu 再加 `os=linux` 启用 `auto_redirect`。Windows/macOS 不传 `os=linux`。TUN 需要对应客户端/系统权限，端口 7897 须未被其他程序占用。

macOS LAN 共享在同一模板加 `lanListen=Mac实际私有IPv4地址`（例如 `192.168.1.20`，请替换成你自己的地址）。只接受具体私有 IPv4，不接受 `0.0.0.0`。LAN 客户端手动使用该地址的 7897 端口；本模板不改变系统防火墙。该入口未设置账户密码，只应向可信 LAN 放行，不可转发到 WAN。未暴露 Clash API/Web 控制台。代理共享与远程控制是不同功能。

### R5S / OpenWrt

模板为 fw4/nftables + TUN `auto_redirect`，默认 LAN 桥名 `br-lan`，如实际桥名不同需改模板。TUN 用 `sb-tun`；DNS 专用入口为 `127.0.0.1:1053`，不抢占 dnsmasq 的 53 端口。规则只捕获经过本机的流量；旁路由仍须让目标 LAN 设备把网关指向 R5S，IPv6 路由也必须经过它。

部署前确认：sing-box 内核版本、fw4/nftables、TUN 内核支持、LAN 桥名与现有代理服务。不要与 PassWall/OpenClash 等同时争用透明代理规则。本仓库不执行安装或防火墙变更。

如 dnsmasq 承担 LAN DNS，可把其上游转发至 `127.0.0.1#1053`，同时避免它继续使用其他外部上游绕过分流。请保留原配置并按现有 UCI 配置操作；这里没有假定可通用执行的 UCI 修改命令。现有 DHCP、内网主机解析应先验证再切换。IPv6 RA/DHCPv6 下发的 DNS 也需一起检查。

### iPhone

面向 sing-box Apple 客户端，使用其系统 VPN/TUN 权限。没有 Linux 的 `auto_redirect`、dnsmasq 入口、mixed LAN 监听或固定物理网卡名称。需要客户端实际内核支持本配置字段。这里只完成配置生成，未在 iPhone 上启动验证。

## 验证与输出

Node.js 20+：

```sh
node scripts/verify.mjs
```

检查覆盖三套合并结果、可选 TUN/LAN、自定义 DNS 映射、无节点失败、保留标签冲突、拒绝自定义策略绑定。测试使用本机虚拟 SOCKS 节点，不访问机场、不启动代理、不改变网络。

把 Sub-Store 的每个最终输出保存到仓库外，再分别运行安装版本的：

```sh
sing-box check -c /path/to/final-config.json
```

然后在每个平台验证国内直连、国外代理、DNS、IPv6、LAN 共享及 OpenWrt 网关流量。离线脚本通过不等同于 sing-box 内核检查或设备联网通过。最终配置含节点凭据，不提交到 Git（`generated/*` 默认忽略）。

## 已查阅的官方依据

- https://sub-store-org.github.io/doc/file/scripts — `$content`、`$files`、`$arguments`、`produceArtifact`
- https://sub-store-org.github.io/doc/subscription/conversion — sing-box 文件模板 + 转换脚本
- https://github.com/xishang0128/sub-store-template/blob/main/sing-box.js — `platform: 'sing-box'` + `produceType: 'internal'` 的实际用法；仅核对接口，未复制其整套模板（该上游已归档）
- https://sing-box.sagernet.org/configuration/inbound/tun/ — OpenWrt fw4 与 auto_redirect
- https://sing-box.sagernet.org/configuration/dns/server/ — typed DNS servers
- https://sing-box.sagernet.org/configuration/route/rule_action/ — sniff / hijack-dns / resolve / reject
