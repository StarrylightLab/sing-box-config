import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const json=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const script=await fs.readFile(new URL('sub-store/scripts/merge.js',root),'utf8');
const node={type:'socks',tag:'TEST-NODE',server:'127.0.0.1',server_port:1080};
async function render(profile,args={},overrides={}) {
 const calls=[];
 const ctx=vm.createContext({$arguments:{name:'test',...args},$content:JSON.stringify(await json('templates/'+profile+'.json')),produceArtifact:async a=>{
  calls.push(a);
  if(a.type==='file') {
   assert.equal(a.name,args.common||'sb-common');
   const common=await json('shared/common.json');
   for(const key of ['custom','sets','policies']) if(Object.hasOwn(overrides,'sb-'+key)) common[key]=overrides['sb-'+key];
   return JSON.stringify(Object.hasOwn(overrides,'common')?overrides.common:common);
  }
  assert.equal(a.platform,'sing-box'); assert.equal(a.produceType,'internal');
  assert.equal(a.type,args.type||'collection');
  return Object.hasOwn(overrides,'nodes')?overrides.nodes:[node];
 }});
 await new vm.Script('(async()=>{'+script+'})()').runInContext(ctx);
 assert.deepEqual(calls.filter(x=>x.type==='file').map(x=>x.name),[args.common||'sb-common']);
 assert(!/optional_tun|remote_rule_links|\{all\}/.test(ctx.$content));
 const c=JSON.parse(ctx.$content),tags=new Set(c.outbounds.map(x=>x.tag)),sets=new Set(c.route.rule_set.map(x=>x.tag));
 assert.equal(tags.size,c.outbounds.length);
 for(const x of c.outbounds) for(const tag of x.outbounds||[]) assert(tags.has(tag));
 assert(c.outbounds.find(x=>x.tag==='手动选择').outbounds.includes('TEST-NODE'));
 assert(c.outbounds.find(x=>x.tag==='proxy').outbounds.includes('auto'));
 for(const x of c.route.rules) if(x.outbound) assert(tags.has(x.outbound));
 for(const x of [...c.route.rules,...c.dns.rules]) for(const tag of x.rule_set||[]) assert(sets.has(tag));
 assert(!c.dns.rules.some(x=>x.ip_cidr));
 return c;
}
for(const p of ['desktop','r5s-openwrt','iphone']) {
 const c=await render(p),mixed=c.inbounds.find(x=>x.type==='mixed');
 for(const set of c.route.rule_set) {
  assert(set.url.startsWith('https://gh-proxy.com/https://raw.githubusercontent.com/'));
  assert.equal(set.download_detour,'direct');
 }
 assert.equal(mixed.listen,'0.0.0.0');assert.equal(mixed.listen_port,7897);
 if(p==='desktop') assert(!c.inbounds.some(x=>x.type==='tun'));
 if(p==='r5s-openwrt') {
  assert.equal(c.inbounds.find(x=>x.type==='tun').auto_redirect,true);
  assert.deepEqual(c.inbounds.find(x=>x.type==='tun').include_interface,['br-lan']);
  assert.equal(c.inbounds.find(x=>x.tag==='dns-in').listen_port,1053);
  assert.equal(c.route.rules[0].action,'hijack-dns');
 }
 if(p==='iphone') assert(c.inbounds.some(x=>x.type==='tun'));
 const t=c.route.rules.findIndex(x=>x.rule_set?.includes('geosite-tencent'));
 const overseas=c.route.rules.findIndex(x=>x.rule_set?.includes('geosite-!cn'));
 assert(t>=0&&t<overseas);
}
for(const os of ['linux','macos','windows']) {
 const c=await render('desktop',{tun:'true',os});
 assert.equal(c.inbounds.find(x=>x.type==='tun').auto_redirect,os==='linux'?true:undefined);
}
await render('desktop',{type:'subscription'});
await render('desktop',{common:'my-common'});
for(const common of [null,[],{}, {custom:{},sets:{},policies:{}}, {custom:{},sets:{},policies:{},unexpected:true}]) await assert.rejects(()=>render('desktop',{}, {common}));
const example=await json('rules/custom.example.json');
const c=await render('desktop',{}, {'sb-custom':example});
const resolve=c.route.rules.findIndex(x=>x.action==='resolve'),remote=c.route.rules.findIndex(x=>x.rule_set);
for(const kind of ['block','proxy','direct']) {
 assert.equal(example[kind].length,5);
 for(const match of example[kind]) {
  const key=Object.keys(match)[0];
  const i=c.route.rules.findIndex(x=>JSON.stringify(x[key])===JSON.stringify(match[key])&&(kind==='block'?x.action==='reject':x.outbound===kind));
  assert(i>resolve&&i<remote);
  if(key!=='ip_cidr') assert(c.dns.rules.some(x=>JSON.stringify(x[key])===JSON.stringify(match[key])&&(kind==='block'?x.action==='reject':x.server==='dns-'+kind)));
 }
}
assert.deepEqual((await json('shared/common.json')).custom,{direct:[{domain:['starrylight.myds.me']}],proxy:[],block:[]});
await assert.rejects(()=>render('desktop',{}, {nodes:[]}),/没有可用节点/);
await assert.rejects(()=>render('desktop',{}, {nodes:[{type:'socks',tag:'direct'}]}),/冲突/);
await assert.rejects(()=>render('desktop',{}, {nodes:[node,node]}),/重复/);
await assert.rejects(()=>render('desktop',{name:''}),/请设置 name/);
await assert.rejects(()=>render('desktop',{type:'bad'}),/type 只能/);
await assert.rejects(()=>render('desktop',{tun:'yes'}),/tun 只能/);
await assert.rejects(()=>render('iphone',{tun:'true'}),/只用于桌面/);
for(const invalid of [{direct:[],proxy:[]},{direct:[{}],proxy:[],block:[]},{direct:[{domain:['example.com'],outbound:'bad'}],proxy:[],block:[]},{direct:[{port:[80]}],proxy:[],block:[]}]) await assert.rejects(()=>render('desktop',{}, {'sb-custom':invalid}));
for(const set of [{type:'remote',tag:'geosite-bad',format:'yaml',url:'https://example.com/a'},{type:'remote',tag:'bad',format:'source',url:'https://example.com/a'}]) await assert.rejects(()=>render('desktop',{}, {'sb-sets':{direct:[set],proxy:[],block:[]}}));
const groupedNodes = ['香港 HK 01','香港 HK 02','台湾 TW 01','新加坡 SG 01','日本 JP 01','美国 US 01','德国 DE 01'].map(tag=>({...node,tag}));
const grouped=await render('desktop',{}, {nodes:[node,...groupedNodes]});
for(const tag of ['香港优选','台湾优选','新加坡优选','日本优选','美国优选','其他地区优选']) assert.equal(grouped.outbounds.find(x=>x.tag===tag).type,'urltest');
assert.deepEqual(grouped.outbounds.find(x=>x.tag==='香港优选').outbounds,['香港 HK 01','香港 HK 02']);
assert(grouped.outbounds.find(x=>x.tag==='其他地区优选').outbounds.includes('德国 DE 01'));
assert(!grouped.outbounds.find(x=>x.tag==='其他地区优选').outbounds.includes('香港 HK 01'));
for(const [set,group] of Object.entries((await json('shared/common.json')).policies.rule_bindings)) assert.equal(grouped.route.rules.find(x=>x.rule_set?.includes(set)).outbound,group);
const nasRoute=grouped.route.rules.findIndex(x=>x.domain?.includes('starrylight.myds.me'));
assert.equal(grouped.route.rules[nasRoute].outbound,'direct');
assert(nasRoute<grouped.route.rules.findIndex(x=>x.rule_set));
assert.equal(grouped.dns.rules.find(x=>x.domain?.includes('starrylight.myds.me')).server,'dns-direct');
assert.equal(grouped.dns.strategy,'prefer_ipv6');
assert.equal(grouped.outbounds.find(x=>x.tag==='direct').domain_resolver.strategy,'prefer_ipv6');
for (const p of ['desktop','iphone','r5s-openwrt']) {
 const generated=await render(p);
 await fs.writeFile(new URL('../../work/validation/'+p+'.json',root),JSON.stringify(generated,null,2));
}
console.log('PASS: 3 profiles, shared policy input, region filtering and empty-region fallback, service bindings, NAS direct and DNS, IPv6, desktop TUN, custom precedence and invalid inputs.');
