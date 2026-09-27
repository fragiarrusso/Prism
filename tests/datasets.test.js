import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('the static prompt bundle is compact, attributed, and excludes internal records',async()=>{
  const data=JSON.parse(await read('data/datasets.json'));
  assert.equal(data.schema_version,'reviewer-demo.datasets.v1');
  const expected={xstest:{count:450,control:250,license:'CC BY 4.0'},jailbreakbench:{count:200,control:100,license:'MIT'}};
  for(const dataset of data.datasets){
    const spec=expected[dataset.id];
    assert.ok(spec,`unexpected dataset ${dataset.id}`);
    assert.equal(dataset.records.length,spec.count);
    assert.equal(dataset.records.filter(row=>row.control===true).length,spec.control);
    assert.equal(dataset.license,spec.license);
    assert.match(dataset.source_url,/^https:\/\//);
    assert.match(dataset.license_url,/^https:\/\//);
    assert.match(dataset.source_sha256,/^[a-f0-9]{64}$/);
    assert.equal(new Set(dataset.records.map(row=>row.id)).size,dataset.records.length);
    for(const row of dataset.records){
      assert.deepEqual(Object.keys(row),['id','prompt','control','category']);
      assert.ok(row.prompt.length>0&&row.prompt.length<=20000);
    }
  }
});

test('the reviewer UI avoids the oversized native local-method menu and boots the Prism sequence',async()=>{
  const app=await read('app.js');
  assert.doesNotMatch(app,/id="local-method"/);
  assert.match(app,/class="local-method-list"/);
  assert.match(app,/type:'taxonomy'/);
  assert.match(app,/type:'translate',language:'it'/);
  assert.match(app,/type:'local',method:'Leet'/);
  assert.match(app,/\['fr','it','de','zh-CN','ru','bho','ay','hr','el','da'\]/);
});

test('GitHub Pages stages the complete static data directory',async()=>{
  const workflow=await read('.github/workflows/pages.yml');
  assert.match(workflow,/cp -R data site\//);
  assert.doesNotMatch(workflow,/npm run build|docker|server\.js/);
});
