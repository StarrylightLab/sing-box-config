// Sub-Store 文件脚本。只使用官方文件脚本接口；凭据只保存在 Sub-Store。
const args = $arguments || {};
if (!args.name) throw new Error('请设置 name 为 Sub-Store 中的订阅或组合订阅名称');
const type = args.type || 'collection';
if (!['subscription', 'collection'].includes(type)) throw new Error('type 只能是 subscription 或 collection');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const config = parse($content ?? $files[0]);
const readFile = async name => parse(await produceArtifact({type: 'file', name}));
const custom = await readFile(args.custom || 'sb-custom');
const sets = await readFile(args.sets || 'sb-sets');
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
const setTags = new Set();
for (const kind of kinds) for (const set of sets[kind]) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw new Error('sets: 规则集必须是对象');
  const allowed = ['tag', 'type', 'format', 'url', 'download_detour', 'update_interval'];
  if (Object.keys(set).some(k => !allowed.includes(k)) || set.type !== 'remote' || !['binary', 'source'].includes(set.format) || typeof set.url !== 'string' || !/^https:\/\//.test(set.url) || typeof set.tag !== 'string' || !/^(geosite|geoip)-.+/.test(set.tag) || setTags.has(set.tag)) throw new Error('sets: 无效链接、类型或重复 tag');
  setTags.add(set.tag);
}
const nodes = await produceArtifact({type, name: args.name, platform: 'sing-box', produceType: 'internal'});
if (!Array.isArray(nodes) || !nodes.length) throw new Error('订阅没有可用节点，停止生成');
const reserved = new Set(config.outbounds.map(x => x.tag));
for (const node of nodes) {
  if (!node || !node.type || typeof node.tag !== 'string' || !node.tag.trim() || reserved.has(node.tag) || ['selector', 'urltest', 'direct', 'block', 'dns'].includes(node.type)) throw new Error('节点名称为空、重复或与模板冲突；请先在 Sub-Store 去重/重命名');
  reserved.add(node.tag);
}
for (const outbound of config.outbounds) if (outbound.outbounds?.includes('{all}')) outbound.outbounds = outbound.outbounds.flatMap(tag => tag === '{all}' ? nodes.map(x => x.tag) : [tag]);
config.outbounds.push(...nodes);
if (args.tun !== undefined && !['true', 'false', true, false].includes(args.tun)) throw new Error('tun 只能是 true/false');
if (args.tun === true || args.tun === 'true') {
  if (!config.optional_tun) throw new Error('tun 参数只用于桌面模板');
  if (args.os === 'linux') config.optional_tun.auto_redirect = true;
  config.inbounds.push(config.optional_tun);
}
delete config.optional_tun;
delete config.remote_rule_links;
const action = kind => kind === 'block' ? {action: 'reject'} : {action: 'route', outbound: kind};
const routeRules = [...config.route.rules];
if (config.inbounds.some(x => x.tag === 'dns-in')) routeRules.unshift({inbound: ['dns-in'], action: 'hijack-dns'});
const dnsRules = [];
const customRules = [];
for (const kind of kinds) for (const match of custom[kind]) {
  customRules.push({...match, ...action(kind)});
  if (!('ip_cidr' in match)) dnsRules.push({...match, ...(kind === 'block' ? {action: 'reject'} : {action: 'route', server: 'dns-' + kind})});
}
// 先解析再匹配个人规则，使个人 IP 规则也优先于第三方规则集。
routeRules.push({action: 'resolve'}, ...customRules);
routeRules.push({ip_is_private: true, ...action('direct')});
const orderedSets = [
  ...sets.block.map(set => ['block', set]),
  ...sets.direct.filter(set => set.tag !== 'geosite-cn' && set.tag !== 'geoip-cn').map(set => ['direct', set]),
  ...sets.proxy.map(set => ['proxy', set]),
  ...sets.direct.filter(set => set.tag === 'geosite-cn' || set.tag === 'geoip-cn').map(set => ['direct', set])
];
for (const [kind, set] of orderedSets) if (set.tag.startsWith('geosite-')) {
  routeRules.push({rule_set: [set.tag], ...action(kind)});
  dnsRules.push({rule_set: [set.tag], ...(kind === 'block' ? {action: 'reject'} : {action: 'route', server: 'dns-' + kind})});
}
for (const [kind, set] of orderedSets) if (set.tag.startsWith('geoip-')) routeRules.push({rule_set: [set.tag], ...action(kind)});
config.route.rules = routeRules;
config.route.rule_set = kinds.flatMap(kind => sets[kind]);
config.dns.rules = dnsRules;
$content = JSON.stringify(config, null, 2);
