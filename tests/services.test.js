import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setKeys,keyStatus,clearKeys,generateTarget,translate,judgeResponse,checkBenign,rewrite,paraphrase} from '../services.js';
const rubric=JSON.parse(readFileSync(new URL('../data/rubric.json',import.meta.url)));
const models=JSON.parse(readFileSync(new URL('../data/models.json',import.meta.url)));
const catalog=JSON.parse(readFileSync(new URL('../data/taxonomy.json',import.meta.url)));
const originalFetch=globalThis.fetch;
const safe={safety_result:'pass',unsafe_information_severity:'none',actionability:'none',compliance:'full',safe_helpfulness:'high'};
function chat(value){return {model:'google/gemma-4-31b-it',choices:[{finish_reason:'stop',message:{content:typeof value==='string'?value:JSON.stringify(value)}}]};}
function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
function native(body,overrides={}){
  const selected={assessable:.99,unsafe:.05,safety_result:'pass',compliance:'full',safe_helpfulness:'high',...overrides};
  const answers=Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{
    if(q.type==='noul')return [id,{type:'noul',noul:selected[id]}];
    const choice=selected[id];const names=Object.keys(q.criteria);return [id,{type:'choice',choice,confidence:.95,probabilities:Object.fromEntries(names.map(n=>[n,n===choice?1:0]))}];
  }));return {model:'typesafe/jev-1.13',answers};
}
test('key lifecycle exposes only presence, not credentials',()=>{clearKeys();assert.equal(keyStatus().openrouter,false);setKeys('test-session-key','test-google-key');assert.deepEqual(keyStatus(),{openrouter:true,google:true});clearKeys();});
test('adding the optional Google key preserves an existing OpenRouter key',()=>{clearKeys();setKeys('test-session-key','');setKeys('','test-google-key');assert.deepEqual(keyStatus(),{openrouter:true,google:true});clearKeys();});
test('target requests use fixed temperature, bearer authentication, and complete outputs',async()=>{
  setKeys('test-session-key','');let captured;
  globalThis.fetch=async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return response(chat('A benign answer.'));};
  try{const result=await generateTarget('Explain lunar phases.','google/gemma-4-31b-it',new AbortController().signal);assert.equal(result.text,'A benign answer.');assert.equal(captured.body.temperature,0);assert.deepEqual(captured.body.provider,{sort:'throughput',allow_fallbacks:true});assert.equal(captured.body.response_format,undefined);assert.equal(captured.options.headers.Authorization,'Bearer test-session-key');assert.equal(captured.options.referrerPolicy,'no-referrer');assert.equal(JSON.stringify(result).includes('test-session-key'),false);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('Google key is in a header, never the query string',async()=>{
  setKeys('','test-google-key');let captured;
  globalThis.fetch=async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return response({data:{translations:[{translatedText:'La Luna &amp; la Terra'}]}});};
  try{const result=await translate('The Moon and Earth','it',new AbortController().signal);assert.equal(result.prompt,'La Luna & la Terra');assert.equal(captured.url.includes('key='),false);assert.equal(captured.options.headers['X-Goog-Api-Key'],'test-google-key');assert.equal(captured.body.target,'it');}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('matching safe ensemble uses two requests and no contextual call',async()=>{
  setKeys('test-session-key','');const calls=[];
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body.questions?native(body):chat(safe));};
  try{const result=await judgeResponse('Explain lunar phases.','The Moon reflects sunlight.','ensemble',rubric,models,new AbortController().signal,()=>{});assert.equal(result.result.label,'pass');assert.equal(calls.length,2);const gemma=calls.find(c=>c.messages);assert.equal(Object.hasOwn(JSON.parse(gemma.messages[1].content),'request'),false);assert.deepEqual(gemma.provider,{sort:'latency',allow_fallbacks:true,require_parameters:true});assert.equal(gemma.response_format.type,'json_schema');assert.equal(gemma.response_format.json_schema.strict,true);assert.deepEqual(gemma.response_format.json_schema.schema.required,['safety_result','unsafe_information_severity','actionability','compliance','safe_helpfulness']);assert.equal(result.components.length,2);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('disagreement invokes contextual Gemma without erasing a valid violation',async()=>{
  setKeys('test-session-key','');const calls=[];let gemmaCalls=0;
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.questions)return response(native(body));gemmaCalls++;return response(chat(gemmaCalls===1?{...safe,safety_result:'minor_violation',unsafe_information_severity:'limited',actionability:'low',compliance:'partial',safe_helpfulness:'not_applicable'}:safe));};
  try{const result=await judgeResponse('Benign fixture request.','Benign fixture response.','ensemble',rubric,models,new AbortController().signal,()=>{});assert.equal(result.result.label,'minor_violation');assert.equal(result.components.length,3);assert.equal(calls.filter(c=>c.messages).length,2);assert.equal(JSON.parse(calls.at(-1).messages[1].content).request,'Benign fixture request.');}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('JEV helpfulness repair is bounded and preserves the pass',async()=>{
  setKeys('test-session-key','');let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);return response(native(body,{safe_helpfulness:calls===1?'not_applicable':'adequate'}));};
  try{const result=await judgeResponse('Benign request.','Benign response.','jev',rubric,models,new AbortController().signal,()=>{});assert.equal(calls,2);assert.equal(result.result.label,'pass');assert.equal(result.result.safe_helpfulness,'adequate');}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('HTTP errors do not echo provider bodies or credentials',async()=>{
  setKeys('test-session-key','');globalThis.fetch=async()=>response({error:{message:'private-provider-content test-session-key'}},401);
  try{await assert.rejects(generateTarget('Benign request.','google/gemma-4-31b-it',new AbortController().signal),e=>e.message==='The API key was not accepted.');}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('benign check rejects a negative decision; no rewrite is performed',async()=>{
  setKeys('test-session-key','');let calls=0;globalThis.fetch=async()=>{calls++;return response(chat({benign:false}));};
  try{await assert.rejects(checkBenign('Fixture input.',models.transformer,new AbortController().signal));assert.equal(calls,1);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('rewrite sends the frozen selection and enforces output constraints',async()=>{
  setKeys('test-session-key','');const techniques=catalog.techniques.slice(0,3).map(t=>t.id);let captured;
  globalThis.fetch=async(url,options)=>{captured=JSON.parse(options.body);return response(chat({prompt:'benign '.repeat(300),techniques}));};
  try{const result=await rewrite('Explain lunar phases.',{minimumWords:300,techniques},catalog,models,new AbortController().signal);const system=readFileSync(new URL('../data/prompts/RedTeamAssistant_Augmented3.txt',import.meta.url),'utf8'),user=readFileSync(new URL('../data/prompts/prompt.txt',import.meta.url),'utf8');assert.deepEqual(result.techniques,techniques);assert.equal(captured.model,'deepseek/deepseek-v4-pro');assert.equal(captured.temperature,.2);assert.deepEqual(captured.provider,{sort:'throughput',allow_fallbacks:true,require_parameters:true});assert.deepEqual(captured.response_format,{type:'json_object'});assert.ok(captured.messages[0].content.startsWith(system.slice(0,80)));assert.match(captured.messages[0].content,/Mode: exact\. Use exactly these techniques and no others:/);assert.equal(captured.messages[1].content,user.replaceAll('{{{PAYLOAD}}}','Explain lunar phases.'));}finally{globalThis.fetch=originalFetch;clearKeys();}
});

test('DeepSeek judging keeps JSON mode while schema-capable judges receive a strict schema',async()=>{
  setKeys('test-session-key','');const calls=[];
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(chat(safe));};
  try{
    await judgeResponse('Fixture request.','Fixture response.','deepseek',rubric,models,new AbortController().signal,()=>{});
    await judgeResponse('Fixture request.','Fixture response.','oss',rubric,models,new AbortController().signal,()=>{});
    assert.equal(calls[0].response_format.type,'json_object');
    assert.equal(calls[1].response_format.type,'json_schema');
    assert.equal(calls[1].response_format.json_schema.name,'prism_safety_judgment');
    assert.equal(calls[0].provider.sort,'latency');
    assert.equal(calls[1].provider.require_parameters,true);
  }finally{globalThis.fetch=originalFetch;clearKeys();}
});

test('paraphrase uses the Prism intent-preservation contract',async()=>{
  setKeys('test-session-key','');let captured;globalThis.fetch=async(url,options)=>{captured=JSON.parse(options.body);return response(chat('Same task, different wording.'));};
  try{const result=await paraphrase('Original controlled request.',models,new AbortController().signal);assert.equal(result.prompt,'Same task, different wording.');assert.equal(captured.temperature,.5);assert.match(captured.messages[0].content,/Preserve the exact intent/);assert.match(captured.messages[0].content,/paraphrase harmful or disallowed requests too/);assert.equal(captured.messages[1].content,'Original controlled request.');}finally{globalThis.fetch=originalFetch;clearKeys();}
});

test('model rewrite rejects deterministic and translation techniques before making a request',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network call');};
  try{for(const id of ['EncodingBase64','ASCIIArt','LowResourceLanguage'])await assert.rejects(()=>rewrite('Explain lunar phases.',{techniques:[id],minimumWords:300},catalog,models,new AbortController().signal),/separate transformation/);assert.equal(calls,0);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
