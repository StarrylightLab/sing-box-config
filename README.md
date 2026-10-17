# sing-box + Sub-Store

日常维护两个规则文件，策略组集中维护在 shared/policies.json，三种设备共用一个合并脚本。订阅与节点凭据只保存在自己的 Sub-Store 中。

    rules/custom.json              自己添加：直连、代理、拒绝
    rules/sets.json                别人仓库的远程规则集链接
    shared/policies.json            三端共用策略组、地区筛选和服务绑定
    templates/desktop.json         macOS / Windows / Ubuntu
    templates/r5s-openwrt.json      R5S OpenWrt
    templates/iphone.json           iPhone
    sub-store/scripts/merge.js      共用合并脚本

custom.example.json 只是格式示例，不会加载；scripts/verify.mjs 只是检查工具。旧的 rules/shared 已移除。

## 在 Sub-Store 上设置

1. 在「订阅」保存机场订阅，在「组合订阅」建立名为 **singbox** 的组合，加入需要的订阅。
2. 在「文件」新增下表的六个远程文件，名称必须一致。

| 文件名称 | 远程链接 |
|---|---|
| sb-custom | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/custom.json |
| sb-sets | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/rules/sets.json |
| sb-policies | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/shared/policies.json |
| sb-desktop | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/desktop.json |
| sb-r5s | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/r5s-openwrt.json |
| sb-iphone | https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/templates/iphone.json |

3. 前三个文件不添加脚本。三个模板文件都添加「脚本操作」，选择远程脚本，填写同一个链接：

    https://gh-proxy.com/https://raw.githubusercontent.com/StarrylightLab/sing-box-config/main/sub-store/scripts/merge.js#type=collection&name=singbox

name=singbox 对应自己的组合名称；中文、空格、& 等需要 URL 编码。使用单个订阅时，将 type=collection 改为 type=subscription，name 填该订阅名称。参数放在脚本链接的 # 后面，不需要额外 JSON。

桌面默认开启 HTTP/SOCKS 混合代理。需要 TUN 时在链接末尾添加：

- macOS / Windows：&tun=true
- Ubuntu：&tun=true&os=linux

R5S 和 iPhone 已开启 TUN，不需要额外参数。

4. 保存并预览：应出现订阅节点，且没有 {all}、optional_tun 或 remote_rule_links。复制 **Sub-Store 生成的文件分享/下载链接**，分别导入设备。GitHub 原始模板没有节点，不能直接作为最终配置使用。

Sub-Store 是六个远程文件，其中三个生成最终配置。合并后的文件包含节点凭据，不要上传到公开仓库。

## 自定义规则

只编辑 [rules/custom.json](rules/custom.json)。direct 表示直连、proxy 表示代理、block 表示拒绝。不写策略组名、outbound 或 action。

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

个人规则优先于第三方规则。同一目标在个人分类中冲突时，按 block → proxy → direct 处理。先嗅探、劫持 DNS、解析域名，再匹配个人路由规则，确保个人 IP 规则也优先。DNS 路由只采用不含 ip_cidr 的个人域名规则。

## 规则集链接

只编辑 [rules/sets.json](rules/sets.json)，同样分 direct、proxy、block，每项指向别人的规则集。例如把下面对象放进 proxy 数组：

    {
      "type": "remote",
      "tag": "geosite-example",
      "format": "binary",
      "url": "https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs",
      "download_detour": "direct",
      "update_interval": "1d"
    }

域名集使用唯一的 geosite- 开头标签；纯 IP 集使用 geoip- 开头标签。脚本根据前缀区分两者，不能混入同时包含域名和 IP 的规则集。支持 sing-box .srs（binary）和源格式 JSON（source），不直接支持 Clash YAML 或普通文本 .list。

默认链接来自 MetaCubeX，覆盖国内、腾讯、Steam 中国及常见海外服务，block 初始为空。域名集先于 IP 集；各阶段内按拒绝、明确直连例外、代理、国内兜底排序。

## 设备说明

- 三个模板的混合代理入口均为 **[::]:7897**。其他设备填写运行 sing-box 的设备局域网 IP 和 7897 端口，防火墙只允许可信局域网访问。
- 桌面仅用混合端口时，在系统/应用设置代理；TUN 需要客户端支持和相应权限。
- R5S 按 OpenWrt 设计，使用 auto_redirect，默认接口 br-lan；接口不同时修改模板。DNS 入口为 127.0.0.1:1053，需要按实际网络设置 dnsmasq 转发。防火墙、IPv6 和其他代理插件冲突仍需在设备上检查；导入模板不代表已经接管全网流量。
- iPhone 的局域网访问还受系统权限和客户端运行状态影响。
- 模板采用 sing-box 1.12 风格的 typed DNS、路由动作及 TUN 字段；按客户端内核版本检查兼容性。
- 远程规则集、Sub-Store 六个远程文件和合并脚本链接均使用与参考模板相同的 gh-proxy.com 前缀；规则集仍通过 direct 下载。加速仅用于公开 GitHub 文件，不要给机场订阅、令牌或 Sub-Store 最终分享链接添加此前缀。若加速服务不可用，可移除 https://gh-proxy.com/ 前缀恢复 GitHub 原始链接；不提供自动回退。修改规则或共用策略文件后，在 Sub-Store 刷新远程文件/缓存，重新生成三个文件并更新设备配置；远程 .srs 由 sing-box 按 update_interval 更新。

## 参考与检查

参考 [qichiyuhub 1.12.x 模板](https://github.com/qichiyuhub/rule/tree/main/config/singbox/1.12.x) 的规则链接、嗅探和 DNS 劫持方式，提取共用服务策略组和地区筛选；香港、台湾、新加坡、日本、美国和其他地区均使用原生 urltest 测速优选，不使用不受支持的负载均衡字段。

脚本接口依据 [Sub-Store 文件脚本文档](https://sub-store-org.github.io/doc/file/scripts) 和 [脚本参数文档](https://sub-store-org.github.io/doc/script/usage)，使用 $content、$arguments、produceArtifact。

离线检查：node scripts/verify.mjs。覆盖三个模板、桌面 TUN、五种个人匹配方式、优先级、DNS 映射、节点冲突和错误输入。

离线合并检查通过不代表设备网络已经验证；导出后还应在目标内核执行 sing-box check -c 配置文件.json。本仓库检查不启动 TUN、不修改系统网络。

本次额外使用 sing-box 1.12.0 的 macOS 内核检查了桌面与 iPhone 合并产物，配置检查通过（不代表 iPhone 实机验证）。OpenWrt 的 auto_redirect 是 Linux 功能，在 macOS 上无法初始化，需在 R5S 本机检查。规则路径已通过 GitHub 仓库目录核对；当前网络对部分 Raw 下载出现超时，尚未证明全部设备均能成功下载。

## 共用策略与多节点

只在 shared/policies.json 维护策略组和规则集对应关系，模板不再重复保存 outbounds。Sub-Store 新增 sb-policies 远程文件后，原来的脚本链接不变；也可用 policies 参数指定其他文件名。不要再叠加旧的节点插入脚本。

- 香港、台湾、新加坡、日本、美国、其他地区：每 10 分钟测速，容差 50ms。一个地区可加入多个节点，测速选一个出口；不是按连接轮询或等量分配。
- 不同服务可同时使用不同地区：默认 ChatGPT/AI 选美国、YouTube/Microsoft 选香港、OneDrive 选台湾、Google 选日本、Telegram 选新加坡；Apple 默认直连。可在客户端修改服务策略组选择。缺少某地区节点时自动回退到全节点测速，避免空组。
- 保留 GitHub、TikTok、Netflix、PayPal、Steam 和漏网之鱼。ChatGPT 规则排在通用 AI 之前；OneDrive 排在 Microsoft 之前；AI 排在 Google 之前。AI 规则集覆盖 Gemini、Grok 等，具体范围由上游维护。
- node_filters 是本脚本自己的节点名称筛选格式，不是 sing-box API。地区识别依赖节点名，特殊命名可在共用文件调整正则。
- 修改 Apple 等服务为代理时，也可将 dns_bindings 中对应项改成 dns-proxy，保持 DNS 选择一致。

## IPv6 和群晖

三个模板 DNS、域名解析和直连出口均优先 IPv6，兼容 IPv4；代理节点域名也允许 IPv6。DNS 服务器本身使用 IPv4 地址不妨碍查询 AAAA 记录。未使用 FakeIP。

rules/custom.json 已加入精确域名 starrylight.myds.me 的直连规则，DNS 走 dns-direct，优先于第三方规则和服务策略。域名仍需发布有效 AAAA，设备网络、防火墙和群晖服务也必须具备 IPv6 可达性；配置检查不能证明公网访问成功。

混合监听改为 [::]:7897，支持 IPv6；主机允许双栈套接字时也接受 IPv4。若目标平台启用 IPv6-only socket，需要按实际系统调整监听。IPv6 客户端代理地址填写 [设备IPv6地址]:7897，IPv4 客户端仍填写设备局域网IPv4和7897。端口应仅对可信局域网放行，尤其不要因全接口IPv6监听意外暴露到公网。
