/* Actual CRuby WebAssembly execution and optional VX Ace syntax compatibility probe.
 * Does not run BLACK SOULS II game scripts or require any proprietary assets.
 * Usage: node tests/wasm-vm.cjs [path/to/Game.rgss3a]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DefaultRubyVM} = require('../vendor/ruby/browser.umd.js');
const {RGSS3Archive} = require('../src/archive.js');
const {ArchiveSource} = require('../src/assets.js');
const {MarshalReader} = require('../src/marshal.js');
const {ScriptCatalog} = require('../src/scripts.js');
global.VX = {MarshalReader};

async function main() {
  const wasm = fs.readFileSync(path.join(__dirname,'../vendor/ruby/ruby+stdlib.wasm'));
  assert.equal(wasm.subarray(0,4).toString('hex'), '0061736d', 'WASM header');
  const module = await WebAssembly.compile(wasm);
  const {vm} = await DefaultRubyVM(module,{consolePrint:false});
  const version = vm.eval('RUBY_VERSION').toString();
  assert.match(version,/^3\.2\./);
  assert.equal(vm.eval('(1..100).sum').toString(),'5050');
  assert.equal(vm.eval('class RubyWasmTest; def self.greet(n); "hi #{n}"; end; end; RubyWasmTest.greet("VX Ace")').toString(),'hi VX Ace');
  assert.equal(vm.eval('RubyVM::InstructionSequence.compile("class Game_Test; end"); :syntax_ok').toString(),'syntax_ok');
  console.log(`PASS: actual browser-targeted CRuby ${version} WebAssembly boots, evaluates Ruby, compiles Ruby source`);

  const file = process.argv[2] || path.join(__dirname, 'sample.rgss3a');
  const archive = await RGSS3Archive.open(await fs.openAsBlob(file));
  if(!archive.has('Data/Scripts.rvdata2')) {
    if(process.argv[2])throw Error('No Data/Scripts.rvdata2 in supplied archive');
    console.log('SKIP: original bundled map fixture has no Scripts.rvdata2; Ruby data import is tested separately by worker-vm.cjs');
    return;
  }
  const scripts = await ScriptCatalog.load(new ArchiveSource(archive));
  const failures = [];
  for (let index = 0; index < scripts.entries.length; index++) {
    const script = scripts.entries[index];
    const source = Buffer.from(script.source,'utf8').toString('base64');
    const label = Buffer.from(script.name,'utf8').toString('base64');
    try {vm.eval(`require 'base64'; RubyVM::InstructionSequence.compile(Base64.strict_decode64("${source}").force_encoding('UTF-8'), Base64.strict_decode64("${label}").force_encoding('UTF-8')); :ok`);}
    catch(error) {failures.push({index,name:script.name,reason:String(error.message || error).slice(0,250)});}
  }
  console.log(`SOURCE SYNTAX (Ruby ${version}): ${scripts.entries.length-failures.length}/${scripts.entries.length} compiled`);
  for (const failure of failures.slice(0,8)) console.log('  INCOMPATIBLE:', JSON.stringify(failure));
  assert(scripts.entries.length > 0);
  if(!process.argv[2]) assert.equal(failures.length,0,'Original sample scripts must compile');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
