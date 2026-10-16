import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const script = await fs.readFile(new URL('sub-store/scripts/merge.js', root), 'utf8');
const paths = {'sb-common':'rules/shared/common.json', 'sb-shared-sets':'rules/shared/sets.json','sb-custom':'rules/custom.json',...Object.fromEntries(['direct','proxy','block'].map(x=>['sb-shared-'+x,'rules/shared/'+x+'.json']))};
async function render(profile, options = {}, override = {}) {
  const calls = [];
  const context = vm.createContext({$arguments:{name:'test-collection',...options},$content:JSON.stringify(await json('templates/'+profile+'.json')),
    produceArtifact: async arg => {
      calls.push(arg);
      if (arg.type === 'file') return JSON.stringify(override[arg.name] || await json(paths[arg.name]));
      return override.nodes || [{type:'socks',tag:'TEST-NODE',server:'127.0.0.1',server_port:1080}];
    }});
  await new vm.Script('(async()=>{'+script+'})()').runInContext(context);
  assert(calls.some(x=>x.platform==='sing-box' && x.produceType==='internal'));
  const config = JSON.parse(context.$content);
  const tags = new Set(config.outbounds.map(x=>x.tag));
  assert.equal(tags.size,config.outbounds.length);
  for (const rule of config.route.rules) if(rule.outbound) assert(tags.has(rule.outbound));
  assert(!context.$content.includes('optional_tun'));
  assert.equal(config.outbounds.find(x=>x.tag==='proxy').outbounds[0],'TEST-NODE');
  return config;
}
for (const profile of ['desktop','r5s-openwrt','iphone']) {
  const config = await render(profile);
  if (profile === 'desktop') assert.equal(config.inbounds[0].listen,'127.0.0.1');
  if (profile === 'r5s-openwrt') assert.equal(config.inbounds[0].auto_redirect,true);
  if (profile === 'iphone') assert(!config.inbounds.some(x=>x.type==='mixed'));
}
const linux = await render('desktop',{tun:'true',os:'linux',lanListen:'192.168.1.20'});
assert.equal(linux.inbounds[1].auto_redirect,true);
assert.equal(linux.inbounds[0].listen,'192.168.1.20');
const custom = {direct:[{domain_suffix:['example.com']}],proxy:[{ip_cidr:['203.0.113.0/24']}],block:[{domain:['ads.example.com']}]};
const config=await render('desktop',{}, {'sb-custom':custom});
assert.equal(config.route.rules.find(x=>x.domain?.includes('ads.example.com')).action,'reject');
assert(config.dns.rules.some(x=>x.domain_suffix?.includes('example.com') && x.server==='dns-direct'));
assert(!config.dns.rules.some(x=>x.ip_cidr));
await assert.rejects(()=>render('desktop',{}, {nodes:[]} ), /No converted nodes/);
await assert.rejects(()=>render('desktop',{}, {nodes:[{type:'socks',tag:'direct'}]}), /reserved/);
await assert.rejects(()=>render('desktop',{}, {'sb-custom':{direct:[{domain:['example.com'],outbound:'wrong'}],proxy:[],block:[]}}), /matcher/);
await assert.rejects(()=>render('desktop',{lanListen:'0.0.0.0'}), /private LAN/);
console.log('PASS: three profiles, desktop TUN/LAN, custom precedence, DNS mapping, empty subscriptions, tag collision, policy-binding rejection.');
