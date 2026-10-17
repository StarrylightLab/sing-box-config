# sing-box + Sub-Store

日常只维护一个公共文件 shared/common.json，里面分 custom（个人规则）、sets（远程规则集链接）、policies（公共策略组）三个区域。三种设备共用一个合并脚本。订阅与节点凭据只保存在自己的 Sub-Store 中。

    shared/common.json             个人规则 + 远程规则集链接 + 公共策略组
    templates/desktop.json         macOS / Windows / Ubuntu
    templates/r5s-openwrt.json      R5S OpenWrt
    templates/iphone.json           iPhone
    sub-store/scripts/merge.js      共用合并脚本

rules/custom.example.json 只是个人规则的格式示例，不会加载；scripts/verify.mjs 只是检查工具。原来的三个公共文件已合并移除。

## 在 Sub-Store 上设置

1. 在「订阅」保存机场订阅，在「组合订阅」建立名为 **singbox** 的组合，加入需要的订阅。
2. 在「文件」新增下表的四个远程文件，名称必须一致。

| 文件名称 | 远程链接 |
|---|---|
| sb-common | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/shared/common.json |
| sb-desktop | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/desktop.json |
| sb-r5s | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/r5s-openwrt.json |
| sb-iphone | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/iphone.json |

3. sb-common 不添加脚本。三个模板文件都添加「脚本操作」，选择远程脚本，填写同一个链接：

    https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/sub-store/scripts/merge.js#type=collection&name=singbox

name=singbox 对应自己的组合名称；中文、空格、& 等需要 URL 编码。使用单个订阅时，将 type=collection 改为 type=subscription，name 填该订阅名称。参数放在脚本链接的 # 后面，不需要额外 JSON。

桌面默认开启 HTTP/SOCKS 混合代理。需要 TUN 时在链接末尾添加：

- macOS / Windows：&tun=true
- Ubuntu：&tun=true&os=linux

R5S 和 iPhone 已开启 TUN，不需要额外参数。

4. 保存并预览：应出现订阅节点，且没有 {all}、optional_tun 或 remote_rule_links。复制 **Sub-Store 生成的文件分享/下载链接**，分别导入设备。GitHub 原始模板没有节点，不能直接作为最终配置使用。

Sub-Store 只需四个远程文件：一个公共配置，三个模板生成最终配置。合并后的文件包含节点凭据，不要上传到公开仓库。

## 从原来的三个公共文件迁移

1. 新建 sb-common，远程链接使用上表的 shared/common.json，不加脚本。
2. 刷新三个模板使用的远程 merge.js 脚本缓存。脚本链接不变；如果手动加过 custom、sets、policies 参数，将它们删除。
3. 依次预览 sb-desktop、sb-r5s、sb-iphone，确认能生成节点和规则。
4. 确认成功后，删除 Sub-Store 旧文件 sb-custom、sb-sets、sb-policies。旧 GitHub 文件链接不再使用。

公共文件分为三个区域：custom 平时添加自己的 direct / proxy / block 规则；sets 修改第三方规则集链接；policies 调整策略组、地区筛选与服务绑定。只增加自己的域名时，改 custom 即可。文件是标准 JSON，不支持注释或末尾多余逗号。

## 自定义规则

编辑 [shared/common.json](shared/common.json) 顶层的 custom 区域。direct 表示直连、proxy 表示代理、block 表示拒绝。不写策略组名、outbound 或 action。下面仅演示 custom 区域的内容，不要覆盖整个公共文件。

    {
      "direct": [
        {"domain": ["direct.example.com"]},
        {"domain_suffix": ["direct.example.org"]}
      ],
      "proxy": [
        {"domain_keyword": ["proxy-keyword"]},
        {"domain_regex": ["^proxy\\d+\\.example\\.net$"]}
      ],
      "block": [
        {"ip_cidr": ["192.0.2.0/24", "2001:db8::/32"]}
      ]
    }

以上是示例，没有启用。实际文件已添加 starrylight.myds.me 精确域名直连，其余分类为空。[完整示例](rules/custom.example.json) 在三个分类中分别演示全部五种匹配方式：

| 字段 | 含义 |
|---|---|
| domain | 完整域名 |
| domain_suffix | 域名及其子域名 |
| domain_keyword | 域名包含关键词 |
| domain_regex | 域名正则；JSON 反斜线须转义，表达式须兼容 sing-box |
| ip_cidr | 目标 IPv4 / IPv6 地址或网段 |

这是本脚本支持的五种字段，并非 sing-box 所有字段。建议每个对象只放一种匹配字段，多个对象表示任选其一；组合字段遵循 sing-box 匹配逻辑。

个人规则优先于第三方规则。同一目标在个人分类中冲突时，按 block → proxy → direct 处理。有个人 ip_cidr 规则时，先解析再匹配，确保个人 IP 规则优先；只有域名规则时，先按域名分流，仅在进入 IP 规则阶段才解析，避免所有代理目标都提前依赖本地 DNS。DNS 路由只采用不含 ip_cidr 的个人域名规则。

## 规则集链接

编辑 [shared/common.json](shared/common.json) 顶层的 sets 区域，同样分 direct、proxy、block，每项指向别人的规则集。例如把下面对象放进 sets.proxy 数组：

    {
      "type": "remote",
      "tag": "geosite-example",
      "format": "binary",
      "url": "https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs",
      "http_client": "rules-direct",
      "update_interval": "1d"
    }

域名集使用唯一的 geosite- 开头标签；纯 IP 集使用 geoip- 开头标签。脚本根据前缀区分两者，不能混入同时包含域名和 IP 的规则集。支持 sing-box .srs（binary）和源格式 JSON（source），不直接支持 Clash YAML 或普通文本 .list。

默认链接来自 MetaCubeX，覆盖国内、腾讯、Steam 中国及常见海外服务，block 初始为空。域名集先于 IP 集；各阶段内按拒绝、明确直连例外、代理、国内兜底排序。

## 设备说明

- 三个模板的混合代理入口均为 **0.0.0.0:7897**。其他设备填写运行 sing-box 的设备局域网 IP 和 7897 端口，防火墙只允许可信局域网访问。
- 桌面公共模板统一拒绝 UDP/443，让 QUIC 不可用时自动回退到 TCP/TLS；macOS、Windows、Ubuntu 使用同一份桌面配置，不需要按系统增加参数。
- 桌面仅用混合端口时，在系统/应用设置代理；TUN 需要客户端支持和相应权限。
- R5S 按 OpenWrt 设计，使用 auto_redirect，默认接口 br-lan；接口不同时修改模板。DNS 入口为 127.0.0.1:1053，需要按实际网络设置 dnsmasq 转发。防火墙、IPv6 和其他代理插件冲突仍需在设备上检查；导入模板不代表已经接管全网流量。
- iPhone 的局域网访问还受系统权限和客户端运行状态影响。
- 当前模板要求 sing-box 1.14.0 或更新内核，保留 typed DNS、路由动作及平台 TUN 差异。不要使用旧的 1.12 内核加载本次配置。
- 已按官方当前文档删除 DNS independent_cache，并将远程规则集 download_detour 改为 http_client。三种模板均显式定义 http_clients 中的 rules-direct（detour: direct），route.default_http_client 也指向它，避免依赖已弃用的隐式下载客户端。这里只迁移规则集下载字段，DNS 服务器及 HTTP 客户端的 detour 仍是有效字段。
- 远程规则集、Sub-Store 四个远程文件和合并脚本链接均使用与参考模板相同的 gh-proxy.com 前缀；规则集仍通过 direct 下载。加速仅用于公开 GitHub 文件，不要给机场订阅、令牌或 Sub-Store 最终分享链接添加此前缀。若加速服务不可用，可移除 https://gh-proxy.com/ 前缀恢复 GitHub 原始链接；不提供自动回退。修改规则或共用策略文件后，在 Sub-Store 刷新远程文件/缓存，重新生成三个文件并更新设备配置；远程 .srs 由 sing-box 按 update_interval 更新。

## 参考与检查

参考 [qichiyuhub 1.12.x 模板](https://github.com/qichiyuhub/rule/tree/main/config/singbox/1.12.x) 的规则链接、嗅探和 DNS 劫持方式，提取共用服务策略组和地区筛选；香港、台湾、新加坡、日本、美国和其他地区均使用原生 urltest 测速优选，不使用不受支持的负载均衡字段。

脚本接口依据 [Sub-Store 文件脚本文档](https://sub-store-org.github.io/doc/file/scripts) 和 [脚本参数文档](https://sub-store-org.github.io/doc/script/usage)，使用 $content、$arguments、produceArtifact。

离线检查：node scripts/verify.mjs。覆盖三个模板、桌面 TUN、五种个人匹配方式、优先级、DNS 映射、节点冲突和错误输入。

离线合并检查通过不代表设备网络已经验证；导出后还应在目标内核执行 sing-box check -c 配置文件.json。本仓库检查不启动 TUN、不修改系统网络。

本次使用 sing-box 1.14.2 的 macOS 内核检查了桌面与 iPhone 合并产物，配置检查通过且没有弃用提示（不代表 iPhone 实机验证）。OpenWrt 的 auto_redirect 是 Linux 功能，在 macOS 上无法初始化，需在 R5S 本机检查。规则路径此前已通过 GitHub 仓库目录核对；尚未证明全部设备均能成功下载。

迁移依据：[官方迁移指南](https://sing-box.sagernet.org/migration/)、[远程规则集](https://sing-box.sagernet.org/configuration/rule-set/)、[HTTP Client](https://sing-box.sagernet.org/configuration/shared/http-client/)、[路由默认 HTTP 客户端](https://sing-box.sagernet.org/configuration/route/#default_http_client)。核对日期：2026-10-17。刷新时同时更新 Sub-Store 中 sb-common、三种模板和远程合并脚本缓存，再重新生成配置并更新客户端；只在客户端重新加载旧文件不会修复源文件。

## DNS 设计与验证

采用两条 DNS 路径，区分三种用途：国内/直连目标通过直连阿里 DoH（dns-direct）解析；代理目标通过代理出口访问 Cloudflare DoH（dns-proxy）；机场节点服务器域名由节点的 domain_resolver 指向 dns-direct，避免节点连接依赖代理 DNS。节点域名解析和应用发出的 DNS 请求不是同一个入口。三个平台共用此逻辑，平台差异保留在 TUN、DNS 接管和监听部分。

当前 dns-direct 的 server 为 223.5.5.5，path 为 /dns-query，TLS server_name 为 dns.alidns.com。使用固定 IP 建立 DoH 连接，无须再增加一个只用于解析 dns.alidns.com 的 bootstrap 服务器。国内外 DNS 使用原有共用规则集分类；dns.final 保留 dns-proxy，与漏网之鱼默认代理一致。服务组 dns_bindings 是静态映射，不会因客户端切换策略组出口而自动同步。

DoH 是传输方式的选择，不能仅凭 UDP 改为 HTTPS 就认定速度或故障已改善。2026-10-17 通过独立 sing-box 1.14.2 回环 DNS 入口测试，同一上游 223.5.5.5、同一域名 channels.weixin.qq.com，关闭该测试实例的 DNS 缓存，各查询 A/AAAA/HTTPS 三轮（9 次）：UDP 全部 NOERROR，中位数 18ms，最大 25ms；DoH 全部 NOERROR，中位数 17ms，最大 75ms（首次连接）。这是当前网络下的少量样本，不能证明其他时段可靠性或所有 DNS 服务商的快慢。

已撤回临时新增的微信个人后缀规则；custom 只保留原来的 starrylight.myds.me，微信继续由已有 geosite-tencent 负责。使用撤回后的产物及下载得到的实际腾讯规则内容做独立测试，A/AAAA 解析成功，日志确认经 dns-direct 和 direct 出口，HTTPS 连接约 0.38 秒完成（HEAD 返回 405）。这证明显式补域名不是当前测试成功的必要条件；用户报告的瞬时错误尚未复现。测试不启用 TUN、不加载真实机场节点、不接管当前客户端。

IPv6 保留 prefer_ipv6，返回 A/AAAA，不过滤 AAAA、HTTPS 或 SVCB 查询；IPv6-only 群晖规则保持原样。直连 DNS 上游使用 IPv4 连接并不限制其查询 AAAA，独立测试已验证。仅在个人 IP 规则要求优先匹配时提前解析；通常先按域名分流，到 IP 规则阶段才 resolve，避免全部代理目标都提前依赖本地解析。

保留正常 DNS 缓存与上游 TTL，不新增 rewrite_ttl、disable_expire 或 optimistic 长时间过期缓存。官方说明 optimistic 可以返回过期记录并后台刷新，默认窗口为 3d；当前存在动态群晖域名和动态 CDN，先保持现有正常缓存，以便诊断。reverse_mapping 保持现状用于辅助域名分流；官方提醒 macOS 系统缓存可能影响此映射，不能把它当作保证命中域名的机制，也不能据此断定它导致 DNS 查询失败。

当前没有自动备用 DNS。只列出多个 servers 不会自动形成容错；若后续需要备用，应单独设计并测试 evaluate/响应匹配/超时的处理，而且需覆盖 domain_resolver 路径，而不只是应用 DNS 规则。暂不添加未经验证的回退或竞速配置。

依据：[DNS 与缓存](https://sing-box.sagernet.org/configuration/dns/)、[DoH 服务器](https://sing-box.sagernet.org/configuration/dns/server/https/)、[拨号字段和 domain_resolver](https://sing-box.sagernet.org/configuration/shared/dial/)、[DNS 动作](https://sing-box.sagernet.org/configuration/dns/rule_action/)、[路由 resolve 动作](https://sing-box.sagernet.org/configuration/route/rule_action/#resolve)。当前网页文档与 v1.14.2 对应源代码均已核对。

刷新 sb-common 并重新生成后，若微信仍失败，应读取故障发生时的日志，区分查询超时、SERVFAIL/NXDOMAIN、TLS 错误和代理端口连接超时。故障不复现时不能把配置检查或少量成功查询当作修复证明。浏览器单独指定的安全 DNS、macOS TUN 接管与局域网代理端口可达性仍需按实际运行环境定位。

## 共用策略与多节点

在 shared/common.json 的 policies 区域维护策略组和规则集对应关系，模板不再重复保存 outbounds。默认读取 Sub-Store 文件 sb-common；也可用 common 参数指定其他公共文件名。不要再叠加旧的节点插入脚本。

- 香港、台湾、新加坡、日本、美国、其他地区：每 10 分钟测速，容差 50ms。一个地区可加入多个节点，测速选一个出口；不是按连接轮询或等量分配。
- 不同服务可同时使用不同地区：默认 ChatGPT/AI 选美国、YouTube/Microsoft 选香港、OneDrive 选台湾、Google 选日本、Telegram 选新加坡；Apple 默认直连。可在客户端修改服务策略组选择。缺少某地区节点时自动回退到全节点测速，避免空组。
- 保留 GitHub、TikTok、Netflix、PayPal、Steam 和漏网之鱼。ChatGPT 规则排在通用 AI 之前；OneDrive 排在 Microsoft 之前；AI 排在 Google 之前。AI 规则集覆盖 Gemini、Grok 等，具体范围由上游维护。
- node_filters 是本脚本自己的节点名称筛选格式，不是 sing-box API。地区识别依赖节点名，特殊命名可在共用文件调整正则。
- 修改 Apple 等服务为代理时，也可将 dns_bindings 中对应项改成 dns-proxy，保持 DNS 选择一致。

## IPv6 和群晖

三个模板 DNS、域名解析和直连出口均优先 IPv6，兼容 IPv4；代理节点域名也允许 IPv6。DNS 服务器本身使用 IPv4 地址不妨碍查询 AAAA 记录。未使用 FakeIP。

shared/common.json 的 custom.direct 已加入精确域名 starrylight.myds.me 的直连规则，DNS 走 dns-direct，优先于第三方规则和服务策略。域名仍需发布有效 AAAA，设备网络、防火墙和群晖服务也必须具备 IPv6 可达性；配置检查不能证明公网访问成功。

混合代理监听固定为 0.0.0.0:7897，即监听所有本机 IPv4 接口。局域网客户端填写设备的实际 IPv4 地址和 7897 端口，不能填写 0.0.0.0。该入口不接收 IPv6 连接，但不影响 DNS 查询 AAAA、直连出口优先 IPv6 或访问 IPv6-only 群晖域名。监听入口与访问目标使用的 IP 版本是两回事。防火墙只应允许可信局域网访问。
