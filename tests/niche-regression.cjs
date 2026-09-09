// Run: node --test tests/niche-regression.cjs (uses the existing TypeScript compiler).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = {exports:{}};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('lib/niche/ideation.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports, require);
const {scoreCorpus, topicTerms, terms} = mod.exports;
const video = (id, views, extra={}) => ({videoId:String(id),channelId:'a',handle:'@a',videoType:'LONG_FORM',title:'ordinary upload',views,observedDays:1,publishedAt:'2026-01-01',durationSeconds:60,...extra});
test('midpoint ties are equal and input-order independent',()=>{
 const corpus=[10,20,20,40].map((v,i)=>video(i,v));
 assert.deepEqual(scoreCorpus(corpus).map(v=>v.percentile),[12.5,50,50,87.5]);
 assert.deepEqual(scoreCorpus([...corpus].reverse()).map(v=>v.percentile).reverse(),[12.5,50,50,87.5]);
 assert.deepEqual(scoreCorpus([0,0,0,0].map((v,i)=>video(i,v))).map(v=>v.percentile),[50,50,50,50]);
});
test('rank gate uses measured peers within channel AND format',()=>{
 const corpus=[...Array.from({length:4},(_,i)=>video(i,10)), ...Array.from({length:3},(_,i)=>video('s'+i,100,{videoType:'SHORTS'})),video('b',500,{channelId:'b'}),video('null',null)];
 assert.deepEqual(scoreCorpus(corpus).map(v=>v.percentile),[50,50,50,50,null,null,null,null,null]);
});
test('crowded and early-signal classifications are mutually exclusive in thin niches',()=>{
 for (const tracked of [1,2,3,4,10]) for(const using of [1,2].filter(n=>n<=tracked)) {
  const scored=Array.from({length:4},(_,i)=>({...video(i,100,{title:'penalty trick',channelId:String(i%using),handle:'@'+i%using}),viewsPerDay:100,percentile:80}));
  const topics=topicTerms(scored,tracked); assert.ok(topics.length);
  for(const t of topics){assert.ok(!(t.isWhitespace && t.isSaturated));assert.equal(t.isSaturated,using/tracked>=.6);assert.equal(t.isWhitespace,using/tracked<.6);}
 }
});
test('unrankable channels still count toward adoption and can close an apparent opening',()=>{
 const scored=Array.from({length:4},(_,i)=>({...video(i,100,{title:'penalty trick'}),viewsPerDay:100,percentile:80}));
 scored.push({...video('b',null,{title:'penalty trick',channelId:'b',handle:'@b'}),viewsPerDay:null,percentile:null});
 const topic=topicTerms(scored,2).find(t=>t.term==='penalty trick');
 assert.equal(topic.channelCount,2);assert.equal(topic.videoCount,4);assert.equal(topic.isSaturated,true);assert.equal(topic.isWhitespace,false);
 assert.equal(topicTerms(scored.slice(0,3),2).length,0);
});
test('topic matching uses exact analysis tokens, including stopword-separated pairs',()=>{
 assert.ok(terms('The DEBT and Crisis!').includes('debt crisis'));
 assert.ok(!terms('Debtor crisis').includes('debt'));
 assert.ok(!terms('Debt banking crisis').includes('debt crisis'));
});
