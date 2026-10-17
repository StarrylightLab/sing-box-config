// Sub-Store 文件脚本。只使用官方文件脚本接口；凭据只保存在 Sub-Store。
const args = $arguments || {};
if (!args.name) throw new Error('请设置 name 为 Sub-Store 中的订阅或组合订阅名称');
const type = args.type || 'collection';
if (!['subscription', 'collection'].includes(type)) throw new Error('type 只能是 subscription 或 collection');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const config = parse($content ?? $files[0]);
const readFile = async name => parse(await produceArtifact({type: 'file', name}));
const common = await readFile(args.common || 'sb-common');
if (!common || typeof common !== 'object' || Array.isArray(common) || Object.keys(common).some(key => !['custom', 'sets', 'policies'].includes(key))) throw new Error('common: 只能包含 custom/sets/policies');
const {custom, sets, policies} = common;
if (!policies || !Array.isArray(policies.outbounds) || !policies.node_filters || !policies.rule_bindings) throw new Error('policies: 缺少策略组、节点筛选或规则绑定');
config.outbounds = policies.outbounds;
const kinds = ['block', 'proxy', 'direct'];
const matchKeys = new Set(['domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr']);
function checkCategories(obj, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !kinds.includes(k))) throw new Error(label + ': 只能有 direct/proxy/block');
  for (const kind of kinds) if (!Array.isArray(obj[kind])) throw new Error(label + ': 缺少 ' + kind + ' 数组');
}
checkCategories(custom, 'custom');
checkCategories(sets, 'sets');
for (const kind of kinds) for (const rule of custom[kind]) {
  if (!rule || Array.isArray(rule) || typeof rule !== 'object' || !Object.keys(rule).length) throw new Error('custom: 不允许空规则');
  for (const [key, value] of Object.entries(rule)) {
    if (!matchKeys.has(key) || !Array.isArray(value) || !value.length || value.some(x => typeof x !== 'string' || !x.trim())) throw new Error('custom: 不支持的字段或值 ' + key);
    if (key === 'domain_regex') for (const regex of value) new RegExp(regex);
  }
}
const httpClients = config.http_clients || [];
const httpTags = new Set(httpClients.map(client => client.tag));
if (!httpClients.length || httpTags.size !== httpClients.length || !httpTags.has(config.route.default_http_client)) throw new Error('模板缺少有效的 HTTP 下载客户端，请更新三种模板');
const setTags = new Set();
for (const kind of kinds) for (const set of sets[kind]) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw new Error('sets: 规则集必须是对象');
  const allowed = ['tag', 'type', 'format', 'url', 'http_client', 'update_interval'];
  if (Object.keys(set).some(k => !allowed.includes(k)) || set.type !== 'remote' || !['binary', 'source'].includes(set.format) || typeof set.url !== 'string' || !/^https:\/\//.test(set.url) || typeof set.tag !== 'string' || !/^(geosite|geoip)-.+/.test(set.tag) || setTags.has(set.tag)) throw new Error('sets: 无效链接、类型或重复 tag');
  if (set.http_client !== undefined && (typeof set.http_client !== 'string' || !httpTags.has(set.http_client))) throw new Error('sets: 不存在的 HTTP 下载客户端');
  setTags.add(set.tag);
}
const nodes = await produceArtifact({type, name: args.name, platform: 'sing-box', produceType: 'internal'});
if (!Array.isArray(nodes) || !nodes.length) throw new Error('订阅没有可用节点，停止生成');
const reserved = new Set(config.outbounds.map(x => x.tag));
for (const node of nodes) {
  if (!node || !node.type || typeof node.tag !== 'string' || !node.tag.trim() || reserved.has(node.tag) || ['selector', 'urltest', 'direct', 'block', 'dns'].includes(node.type)) throw new Error('节点名称为空、重复或与模板冲突；请先在 Sub-Store 去重/重命名');
  reserved.add(node.tag);
}
// node_filters 是本脚本的配置，不会传给 sing-box。空地区组会移除，引用回退到全节点测速。
const usableNodes = nodes.filter(node => !/官网|到期|剩余|流量|套餐|订阅|Traffic|ExpireDate/i.test(node.tag));
if (!usableNodes.length) throw new Error('订阅没有可用节点，停止生成');
const emptyGroups = new Set();
const regionPatterns = Object.entries(policies.node_filters);
for (const [tag, filter] of regionPatterns) {
  if (!config.outbounds.some(x => x.tag === tag)) throw new Error('policies: 筛选器引用不存在的组 ' + tag);
  if (!filter || Object.keys(filter).some(k => !['include', 'exclude'].includes(k))) throw new Error('policies: 无效筛选器');
}
for (const outbound of config.outbounds) {
  if (!['selector', 'urltest', 'direct'].includes(outbound.type)) throw new Error('policies: 不支持的组类型 ' + outbound.type);
  const filter = policies.node_filters[outbound.tag];
  let selected = usableNodes;
  if (filter?.include) selected = selected.filter(node => new RegExp(filter.include, 'i').test(node.tag));
  if (filter?.exclude) selected = selected.filter(node => !new RegExp(filter.exclude, 'i').test(node.tag));
  if (outbound.outbounds?.includes('{all}')) {
    outbound.outbounds = outbound.outbounds.flatMap(tag => tag === '{all}' ? selected.map(x => x.tag) : [tag]);
    if (!outbound.outbounds.length) emptyGroups.add(outbound.tag);
  }
}
config.outbounds = config.outbounds.filter(x => !emptyGroups.has(x.tag));
for (const outbound of config.outbounds) if (outbound.outbounds) outbound.outbounds = [...new Set(outbound.outbounds.map(tag => emptyGroups.has(tag) ? 'auto' : tag))];
// 机场节点服务器本身优先用 IPv4 建连，避免节点的 IPv6 路径影响 QUIC/UDP；
// 目标网站仍按模板的 prefer_ipv6 解析，不影响 IPv6-only 直连规则。
for (const node of nodes) if (node.domain_resolver === undefined) node.domain_resolver = {server: 'dns-direct', strategy: 'ipv4_only'};
config.outbounds.push(...nodes);
if (args.tun !== undefined && !['true', 'false', true, false].includes(args.tun)) throw new Error('tun 只能是 true/false');
if (args.tun === true || args.tun === 'true') {
  if (!config.optional_tun) throw new Error('tun 参数只用于桌面模板');
  if (args.os === 'linux') config.optional_tun.auto_redirect = true;
  config.inbounds.push(config.optional_tun);
}
delete config.optional_tun;
delete config.remote_rule_links;
const tags = new Set(config.outbounds.map(x => x.tag));
if (!['direct','proxy','auto'].every(tag => tags.has(tag)) || tags.size !== config.outbounds.length) throw new Error('policies: 缺少基础出口或 tag 重复');
for (const out of config.outbounds) for (const tag of out.outbounds || []) if (!tags.has(tag)) throw new Error('policies: 不存在的出口 ' + tag);
for (const [set, tag] of Object.entries(policies.rule_bindings)) if (!setTags.has(set) || !tags.has(tag)) throw new Error('policies: 无效的规则集绑定 ' + set + ' -> ' + tag);
for (const client of httpClients) if (client.detour && !tags.has(client.detour)) throw new Error('模板 HTTP 下载客户端引用不存在的出口');
const dnsTags = new Set(config.dns.servers.map(x => x.tag));
for (const required of ['dns-direct', 'dns-proxy', 'dns-fakeip', 'dns-local', 'dns-hosts']) if (!dnsTags.has(required)) throw new Error('模板缺少 DNS 服务器 ' + required);
for (const [group, server] of Object.entries(policies.dns_bindings || {})) if (!tags.has(group) || !dnsTags.has(server)) throw new Error('policies: 无效的 DNS 绑定 ' + group + ' -> ' + server);
const action = (kind, set) => kind === 'block' ? {action: 'reject'} : {action: 'route', outbound: kind === 'proxy' && set ? (policies.rule_bindings[set.tag] || 'proxy') : kind};
const routeRules = [...config.route.rules];
if (config.inbounds.some(x => x.tag === 'dns-in')) routeRules.unshift({inbound: ['dns-in'], action: 'hijack-dns'});
const dnsRules = [...config.dns.rules];
const customRules = [];
for (const kind of kinds) for (const match of custom[kind]) {
  customRules.push({...match, ...action(kind)});
  if (!('ip_cidr' in match)) dnsRules.push({...match, ...(kind === 'block' ? {action: 'reject'} : {action: 'route', server: kind === 'proxy' ? 'dns-fakeip' : 'dns-direct'})});
}
// 仅在个人 IP 规则需要时提前解析；普通域名先分流，避免代理目标也依赖本地 DNS。
const hasCustomIPRules = customRules.some(rule => 'ip_cidr' in rule);
if (hasCustomIPRules) routeRules.push({action: 'resolve', strategy: 'prefer_ipv6'});
routeRules.push(...customRules);
routeRules.push({ip_is_private: true, ...action('direct')});
const orderedSets = [
  ...sets.block.map(set => ['block', set]),
  ...sets.direct.filter(set => set.tag !== 'geosite-cn' && set.tag !== 'geoip-cn').map(set => ['direct', set]),
  ...sets.proxy.map(set => ['proxy', set]),
  ...sets.direct.filter(set => set.tag === 'geosite-cn' || set.tag === 'geoip-cn').map(set => ['direct', set])
];
for (const [kind, set] of orderedSets) if (set.tag.startsWith('geosite-')) {
  // 代理域名在路由阶段重新解析为 IPv4，避免 Cloudflare 等站点选中不稳定的 IPv6 路径。
  if (kind === 'proxy') routeRules.push({rule_set: [set.tag], action: 'resolve', strategy: 'ipv4_only'});
  routeRules.push({rule_set: [set.tag], ...action(kind, set)});
  const dnsServer = kind === 'block' ? undefined : (kind === 'proxy' ? 'dns-fakeip' : (policies.dns_bindings?.[policies.rule_bindings[set.tag]] || 'dns-direct'));
  dnsRules.push({rule_set: [set.tag], ...(kind === 'block' ? {action: 'reject'} : {action: 'route', server: dnsServer})});
}
// 未被域名规则匹配的目标，到 IP 规则阶段才解析；解析后再次保护私网地址。
if (!hasCustomIPRules) routeRules.push({action: 'resolve', strategy: 'prefer_ipv6'}, {ip_is_private: true, ...action('direct')});
for (const [kind, set] of orderedSets) if (set.tag.startsWith('geoip-')) routeRules.push({rule_set: [set.tag], ...action(kind, set)});
config.route.rules = routeRules;
config.route.rule_set = kinds.flatMap(kind => sets[kind]);
config.dns.rules = dnsRules;
$content = JSON.stringify(config, null, 2);
