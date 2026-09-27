import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectableTechniques,validateTechniqueSelection,techniqueExamples,prismEnsemble,scores} from '../core.js';
import {setKeys,clearKeys,judgeResponse,generateTarget,rewrite} from '../services.js';
const load=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const catalog=load('taxonomy'),models=load('models'),rubric=load('rubric'),pool=selectableTechniques(catalog);
const safe={status:'scored',label:'pass',severity:'none',actionability:'none',compliance:null,safe_helpfulness:'high'};
const unsafe={status:'scored',label:'material_violation',severity:'material',actionability:'moderate',compliance:'full',safe_helpfulness:null};
const safeJSON={safety_result:'pass',unsafe_information_severity:'none',actionability:'none',compliance:'full',safe_helpfulness:'high'};
const originalFetch=globalThis.fetch;
const response=(body,value=safeJSON)=>new Response(JSON.stringify({model:body.model,choices:[{finish_reason:'stop',message:{content:typeof value==='string'?value:JSON.stringify(value)}}]}),{status:200});

test('manual selection accepts one, two, and more than ten techniques; sampling remains bounded',()=>{
  for(const count of [1,2,11,pool.length])assert.equal(validateTechniqueSelection({selection:'manual',techniques:pool.slice(0,count)},catalog).length,count);
  assert.throws(()=>validateTechniqueSelection({selection:'manual',techniques:[]},catalog),/at least one/);
  for(const count of [2,11])assert.throws(()=>validateTechniqueSelection({selection:'sampled',techniques:pool.slice(0,count)},catalog),/3–10/);
});
test('examples support empty, one, and two entries with clear authoring validation',()=>{
  for(const value of [undefined,null,'',[],['','  ']])assert.deepEqual(techniqueExamples({DefinedPersonas:{examples:value}},'DefinedPersonas'),[]);
  assert.deepEqual(techniqueExamples({DefinedPersonas:{examples:[' First. ']}},'DefinedPersonas'),['First.']);
  assert.deepEqual(techniqueExamples({DefinedPersonas:{examples:['One.','','Two.']}},'DefinedPersonas'),['One.','Two.']);
  assert.throws(()=>techniqueExamples({DefinedPersonas:{examples:['One.','Two.','Three.']}},'DefinedPersonas'),/at most two/);
  assert.throws(()=>techniqueExamples({DefinedPersonas:{examples:[{}]}},'DefinedPersonas'),/strings/);
});
test('PRISM averages scores without inventing a category or changing the original compliance convention',()=>{
  const result=prismEnsemble([safe,unsafe,safe,unsafe]);
  assert.equal(result.status,'complete');assert.equal(result.label,null);assert.equal(result.valid_judges,4);
  assert.equal(result.overall_score,(1+scores(unsafe).neutral)/2);
  assert.equal(result.scores.signed,(1+scores(unsafe).signed)/2);
  assert.notEqual(result.overall_score,result.scores.signed);
});
test('PRISM makes partial coverage explicit and excludes errors and unclear results from its denominator',()=>{
  const result=prismEnsemble([safe,{status:'error'},{status:'unclear'},{status:'error'}]);
  assert.equal(result.status,'partial');assert.equal(result.overall_score,1);assert.equal(result.valid_judges,1);assert.equal(result.expected_judges,4);
  assert.equal(prismEnsemble(Array(4).fill({status:'unclear'})).overall_score,null);
  assert.equal(prismEnsemble(Array(4).fill({status:'error'})).scores.neutral,null);
});
test('each additional individual judge uses its selected model and the actual request context',async()=>{
  setKeys('test-session-key','');const calls=[];
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body);};
  try{for(const judge of models.rubric_judges){const result=await judgeResponse('Explain lunar phases.','The Moon reflects sunlight.',judge.id,rubric,models,new AbortController().signal);assert.equal(calls.at(-1).model,judge.model);assert.equal(JSON.parse(calls.at(-1).messages[1].content).request,'Explain lunar phases.');assert.equal(result.result.label,'pass');}}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('PRISM calls four distinct models and retains each individual judgment',async()=>{
  setKeys('test-session-key','');const calls=[];
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.model);return response(body);};
  try{const result=await judgeResponse('Explain lunar phases.','The Moon reflects sunlight.','prism',rubric,models,new AbortController().signal);assert.equal(new Set(calls).size,4);assert.deepEqual([...calls].sort(),models.rubric_judges.map(j=>j.model).sort());assert.equal(result.components.length,4);assert.equal(result.result.overall_score,1);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('a failed PRISM component remains explicit while the three valid scores contribute',async()=>{
  setKeys('test-session-key','');
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);return body.model===models.rubric_judges[0].model?new Response('{}',{status:429}):response(body);};
  try{const result=await judgeResponse('Benign request.','Benign response.','prism',rubric,models,new AbortController().signal);assert.equal(result.result.status,'partial');assert.equal(result.result.valid_judges,3);assert.equal(result.result.overall_score,1);assert.equal(result.components.filter(p=>p.status==='error').length,1);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('single-technique rewriting works and display examples never enter the request',async()=>{
  setKeys('test-session-key','');let captured;const techniques=['DefinedPersonas'];
  globalThis.fetch=async(url,options)=>{captured=JSON.parse(options.body);return response(captured,{prompt:'benign '.repeat(300),techniques});};
  try{const result=await rewrite('Explain lunar phases.',{minimumWords:300,techniques,selection:'manual'},{techniques:catalog.techniques.map(t=>({...t,examples:['DISPLAY_ONLY_MARKER']}))},models,new AbortController().signal);assert.deepEqual(result.techniques,techniques);assert.equal(JSON.stringify(captured).includes('DISPLAY_ONLY_MARKER'),false);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
test('older model presets respect their configured output limit',async()=>{
  setKeys('test-session-key','');let body;globalThis.fetch=async(url,options)=>{body=JSON.parse(options.body);return response(body,'A benign answer.');};
  try{const config=models.targets.find(m=>m.model==='google/gemma-2-27b-it');await generateTarget('Explain lunar phases.',config.model,new AbortController().signal,config);assert.equal(body.max_tokens,2048);}finally{globalThis.fetch=originalFetch;clearKeys();}
});
