const assert = require('node:assert/strict');
const {server} = require('./server.cjs');

(async()=>{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const root=`http://127.0.0.1:${server.address().port}`;
  for(const [file,expectedType] of [
    ['/','text/html'],
    ['/src/ruby-vm.js','text/javascript'],
    ['/src/rgss3-data.js','text/javascript'],
    ['/src/ruby-worker.js','text/javascript'],
    ['/src/rgss3-display.js','text/javascript'],
    ['/src/rgss3-bootstrap.rb','application/octet-stream'],
    ['/src/rgss3-rpg.rb','application/octet-stream'],
    ['/vendor/ruby/browser.umd.js','text/javascript'],
    ['/vendor/ruby/ruby+stdlib.wasm','application/wasm'],
  ]) {
    const response=await fetch(root+file,{method:'HEAD'});
    assert.equal(response.status,200,file);
    assert(response.headers.get('content-type').includes(expectedType),file);
  }
  const outside=await fetch(root+'/%2e%2e/Game.rgss3a');
  assert.equal(outside.status,404,'must not serve parent proprietary game file');
  console.log('PASS: local HTTP server serves browser worker, UMD adapter and WASM with correct MIME; game archive outside web root is not served');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
