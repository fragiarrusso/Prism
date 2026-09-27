import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCAL_METHODS,localTransform} from '../transforms.js';
const catalog=JSON.parse(readFileSync(new URL('../data/taxonomy.json',import.meta.url)));
const vectors=JSON.parse(readFileSync(new URL('./encoding-vectors.json',import.meta.url)));

test('all fifteen encoders match reference vectors, including non-BMP Unicode and punctuation',()=>{
  for(const {input,expected} of vectors)for(const [method,value] of Object.entries(expected))assert.equal(localTransform(input,method).prompt,value,method);
});
test('every local catalog entry is implemented, isolated from model selection, and repeatable',()=>{
  assert.deepEqual(catalog.techniques.filter(t=>t.mode==='local').map(t=>t.id).sort(),LOCAL_METHODS.map(m=>m.id).sort());
  for(const method of LOCAL_METHODS){const a=localTransform('Hello, world!',method.id);assert.equal(a.prompt,localTransform('Hello, world!',method.id).prompt);assert.equal(catalog.techniques.find(t=>t.id===method.id).selectable,false);}
});
test('fixed perturbations preserve specified operation and word boundaries',()=>{
  assert.equal(localTransform('please phone before night','PhoneticRespelling').prompt,'plz fone b4 nite');
  assert.equal(localTransform('Hello world','Misspelling').prompt,'Jello workd');
  assert.equal(localTransform('a moon','VowelRemoval').prompt,'a mn');
  assert.equal(localTransform('Moon rises.','DotSeparated').prompt,'M.o.o.n r.i.s.e.s.');
  assert.equal(localTransform('Moon rises.','SpaceSeparated').prompt,'M o o n r i s e s.');
  assert.equal(localTransform('Hello apple','PigLatin').prompt,'Ellohay appleway');
});
test('seeded perturbations match Prism CPython reference fixtures',()=>{
  const settings={seed:42,probability:.35},text='Attack at noon, please!';
  const expected={Leet:'A77ack at n00n, p1ease!',PigLatin:'Attack atway oonnay, easeplay!',VowelRemoval:'Attck t non, pleas!',CharacterSubstitution:'A7+ack at n00n, pl3ase!',PhoneticRespelling:'Attack at noon, please!',Misspelling:'Attack at nooon, please!',DotSeparated:'Attack a.t n.o.o.n, p.l.e.a.s.e!',HomoglyphSubstitution:'Attасk аt noon, plеaѕе!'};
  for(const [method,value] of Object.entries(expected))assert.equal(localTransform(text,method,settings).prompt,value,method);
});
test('encoding instruction matches the Prism single-step contract',()=>{
  const result=localTransform('Hello','EncodingBase64',{includePrompt:true,example:'Hi'});
  assert.match(result.prompt,/pipeline: base64/);
  assert.match(result.prompt,/Plain text: Hi\nEncoded text: SGk=/);
  assert.match(result.prompt,/Request:\nSGVsbG8=\n\nResponse:$/);
});
test('ASCII Art is bounded and does not silently discard unsupported characters',()=>{
  assert.equal(localTransform('A','ASCIIArt').prompt,' # \n# #\n###\n# #\n# #');
  assert.throws(()=>localTransform('月','ASCIIArt'),/ASCII Art supports/);
  assert.throws(()=>localTransform('a'.repeat(40001),'EncodingBase64'),/40,000/);
  assert.throws(()=>localTransform('hello','unknown'),/Unknown/);
  assert.throws(()=>localTransform('a'.repeat(40000),'ASCIIArt'),/output limit/);
});
