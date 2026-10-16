// Sub-Store file script. Configure arguments in Sub-Store, never in Git.
// Only documented globals: $arguments, $content, $files, produceArtifact.
const args = $arguments || {};
if (!args.name) throw new Error('Set name to a saved Sub-Store subscription/collection name.');
const type = args.type || 'collection';
if (!['subscription', 'collection'].includes(type)) throw new Error('type must be subscription or collection');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const file = async name => parse(await produceArtifact({type: 'file', name}));
const profile = parse($content || $files[0]);
const common = await file(args.common || 'sb-common');
const sets = await file(args.sets || 'sb-shared-sets');
const custom = await file(args.custom || 'sb-custom');
const shared = {};
for (const kind of ['block', 'proxy', 'direct']) {
  const source = await file(args['shared_' + kind] || 'sb-shared-' + kind);
  shared[kind] = source.rules;
}
// Match-only entries: policy bindings are added here, never stored in custom.json.
const keys = new Set(['domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr']);
function validateRules(group, label) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(label + ': expected direct/proxy/block object');
  for (const key of Object.keys(group)) if (!['direct', 'proxy', 'block'].includes(key)) throw new Error(label + ': unexpected category ' + key);
  for (const kind of ['block', 'proxy', 'direct']) {
    if (!Array.isArray(group[kind])) throw new Error(label + ': missing array ' + kind);
    for (const rule of group[kind]) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !Object.keys(rule).length) throw new Error(label + ': empty/invalid rule');
      for (const [key, value] of Object.entries(rule)) {
        if (!keys.has(key) || !Array.isArray(value) || !value.length || value.some(x => typeof x !== 'string' || !x.trim())) throw new Error(label + ': invalid matcher ' + key);
        if (key === 'domain_regex') for (const pattern of value) new RegExp(pattern);
      }
    }
  }
}
validateRules(custom, 'custom');
validateRules(shared, 'shared');
const proxies = await produceArtifact({type, name: args.name, platform: 'sing-box', produceType: 'internal'});
if (!Array.isArray(proxies) || !proxies.length) throw new Error('No converted nodes; refusing to fall back to direct.');
const tags = new Set(common.outbounds.map(x => x.tag));
for (const node of proxies) {
  if (!node || !node.type || typeof node.tag !== 'string' || !node.tag.trim() || tags.has(node.tag)) throw new Error('Empty, duplicate or reserved node tag. Rename/deduplicate in Sub-Store.');
  if (['selector', 'urltest', 'direct', 'block', 'dns'].includes(node.type)) throw new Error('Expected converted proxy nodes only.');
  tags.add(node.tag);
}
common.outbounds.find(x => x.tag === 'proxy').outbounds = proxies.map(x => x.tag);
common.outbounds.push(...proxies);
const config = common;
config.inbounds = profile.inbounds;
if (args.tun !== undefined && !['true', 'false', true, false].includes(args.tun)) throw new Error('tun must be true or false');
if (args.tun === 'true' || args.tun === true) {
  if (!profile.optional_tun) throw new Error('tun argument is for desktop only');
  const tun = profile.optional_tun;
  if (args.os === 'linux') tun.auto_redirect = true;
  config.inbounds.push(tun);
}
if (args.lanListen) {
  const mixed = config.inbounds.find(x => x.type === 'mixed');
  const parts = String(args.lanListen).split('.').map(Number);
  const privateIP = parts.length === 4 && parts.every(x => Number.isInteger(x) && x >= 0 && x <= 255) &&
    (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (!mixed || !privateIP) throw new Error('lanListen requires desktop and a concrete private LAN IPv4 address');
  mixed.listen = String(args.lanListen);
}
const routeRules = [{action: 'sniff'}, {protocol: 'dns', action: 'hijack-dns'}];
if (config.inbounds.some(x => x.tag === 'dns-in')) routeRules.unshift({inbound: ['dns-in'], action: 'hijack-dns'});
const dnsRules = [];
function append(group) {
  for (const kind of ['block', 'proxy', 'direct']) for (const match of group[kind]) {
    routeRules.push({...match, ...(kind === 'block' ? {action: 'reject'} : {action: 'route', outbound: kind})});
    // IP-CIDR rules act on connection destinations, not DNS questions.
    // Do not broaden a mixed domain+IP matcher by dropping its IP condition.
    if ('ip_cidr' in match) continue;
    dnsRules.push({...match, ...(kind === 'block' ? {action: 'reject'} : {action: 'route', server: 'dns-' + kind})});
  }
}
routeRules.push({action: 'resolve'});
append(custom);
routeRules.push({ip_is_private: true, action: 'route', outbound: 'direct'});
append(shared);
routeRules.push({...sets.direct_domains, action: 'route', outbound: 'direct'});
dnsRules.push({...sets.direct_domains, action: 'route', server: 'dns-direct'});
routeRules.push({rule_set: ['geosite-cn'], action: 'route', outbound: 'direct'});
routeRules.push({ip_is_private: true, action: 'route', outbound: 'direct'}, {rule_set: ['geoip-cn'], action: 'route', outbound: 'direct'});
config.route.rules = routeRules;
config.route.rule_set = sets.rule_sets;
config.dns.rules = [...dnsRules, ...sets.dns];
$content = JSON.stringify(config, null, 2);
