const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DefaultRubyVM}=require('../vendor/ruby/browser.umd.js');

(async()=>{
  const wasm=fs.readFileSync(path.join(__dirname,'../vendor/ruby/ruby+stdlib.wasm'));
  const {vm}=await DefaultRubyVM(await WebAssembly.compile(wasm),{consolePrint:false});
  const calls=[];
  let frame=0;
  global.__VXRGSS3={
    frame:()=>new Promise(resolve=>setTimeout(()=>{frame++;resolve(null);},1)),
    resize:(...x)=>calls.push(['resize',...x]), fade:(...x)=>calls.push(['fade',...x]),
    inputUpdate:()=>calls.push(['input-update']),
    inputPress:()=>true,inputTrigger:()=>false,inputRepeat:()=>true,inputDir4:()=>6,
    audio:(...x)=>calls.push(['audio',...x]),
    bitmapCreate:(...x)=>{calls.push(['bitmap-create',...x]);return 10;},
    bitmapLoad:()=>11,bitmapDispose:()=>{},bitmapClear:()=>{},
    bitmapFill:(...x)=>calls.push(['fill',...x]),
    bitmapText:(...x)=>calls.push(['text',...x]),
    bitmapBlt:()=>{},bitmapStretchBlt:()=>{},
    spriteCreate:()=>20,spriteSet:(...x)=>calls.push(['sprite-set',...x]),spriteDispose:()=>{},
  };
  vm.eval(fs.readFileSync(path.join(__dirname,'../src/rgss3-bootstrap.rb'),'utf8'));
  const script=`
    b = Bitmap.new(64, 64)
    b.fill_rect(0, 0, 64, 64, Color.new(255, 10, 10))
    b.draw_text(0,0,64,30,'Test',1)
    s = Sprite.new
    s.bitmap = b
    s.x = 48
    Graphics.resize_screen(544,416)
    Audio.bgm_play('test',50)
    3.times do
      Graphics.update
      Input.update
    end
    [Graphics.frame_count, Input.dir4, Input.press?(Input::C)].inspect
  `;
  const result=await vm.evalAsync(script);
  assert.equal(result.toString(),'[3, 6, true]');
  assert.equal(frame,3);
  for(const op of ['bitmap-create','fill','text','sprite-set','resize','audio'])
    assert(calls.some(item=>item[0]===op),`missing JS command ${op}`);
  console.log('PASS: real Ruby/WASM RGSS3 subset bridges Graphics.update async frames, Input, Audio, Bitmap, Sprite and Canvas drawing commands');
})().catch(error=>{console.error(error);process.exitCode=1;});
