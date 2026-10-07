import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/seedance-2-5.json', import.meta.url)));
const nodes = Object.fromEntries(workflow.nodes.map(n => [n.name, n]));
function execute(name, input = {}, context = {}) {
  const sandbox = {Date, $input: {first: () => ({json: input})}, $: name => ({item: {json: context[name]}, first: () => ({json: context[name]})})};
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){${nodes[name].parameters.jsCode}})()`, sandbox)));
}
const prior = () => ({base_url: 'https://example.invalid/v1', request_id: 'job_test', polls: 0, deadline_ms: Date.now()+60000, max_polls: 10, poll_seconds: 10});
const inspect = (body, statusCode = 200, headers = {}, state = prior()) => execute('Inspect response', {body,statusCode,headers}, {'Wait before poll': state})[0].json;
test('every connection targets a real node and only one POST exists', () => {
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(nodes[source]);
    for (const branch of outputs.main) for (const edge of branch) assert.ok(nodes[edge.node]);
  }
  const post = workflow.nodes.filter(n => n.parameters.method === 'POST');
  assert.deepEqual(post.map(n=>n.name), ['Submit once']);
  assert.equal(post[0].retryOnFail, false);
  assert.equal(nodes['Download MP4'].parameters.options.response.response.outputPropertyName, 'video');
});
test('all HTTP nodes use generic Header Auth; no static bearer token is exported', () => {
  for (const node of workflow.nodes.filter(n=>n.type.endsWith('.httpRequest'))) {
    assert.equal(node.parameters.authentication, 'genericCredentialType');
    assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth');
    assert.ok(node.credentials.httpHeaderAuth.name);
    assert.ok(!JSON.stringify(node.parameters).includes('Bearer '));
  }
});
test('poll loop cannot reach submit and has both time and count bounds', () => {
  const seen=new Set(); const visit=name=>{if(seen.has(name))return;seen.add(name);for(const branch of workflow.connections[name]?.main??[])for(const edge of branch)visit(edge.node);};
  visit('Poll status'); assert.equal(seen.has('Submit once'),false);
  assert.throws(()=>inspect({status:'pending'},200,{}, {...prior(),polls:9}),/Polling stopped/);
  assert.throws(()=>inspect({status:'pending'},200,{}, {...prior(),deadline_ms:0}),/Polling stopped/);
});
test('preserves job context across pending and terminal responses', () => {
  assert.equal(inspect({status:'pending'}).request_id,'job_test');
  for(const status of ['done','failed','expired']) assert.equal(inspect({status}).status,status);
  assert.throws(()=>inspect({status:'unrecognized'}),/Unknown job status/);
});
test('429/503 respect Retry-After; other HTTP failures do not loop', () => {
  for(const code of [429,503])assert.equal(inspect({},code,{'retry-after':'15'}).wait_seconds,15);
  assert.throws(()=>inspect({},429,{'retry-after':'9999'}),/exceeds deadline/);
  assert.throws(()=>inspect({},401),/Poll HTTP 401/);
});
test('resume ID overrides submit response and missing ID fails closed', () => {
  const config=execute('Configure')[0].json;
  assert.equal(execute('Remember job',{request_id:'returned_id'},{Configure:config})[0].json.request_id,'returned_id');
  assert.equal(execute('Remember job',{}, {Configure:{...config,resume_request_id:'old_id'}})[0].json.request_id,'old_id');
  assert.throws(()=>execute('Remember job',{}, {Configure:config}),/Missing or malformed/);
});
