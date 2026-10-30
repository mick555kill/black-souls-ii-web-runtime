const assert=require('node:assert/strict');
const {RGSS3Display}=require('../src/rgss3-display.js');

const operations=[];
function makeCanvas(){
  const ctx={
    clearRect:(...x)=>operations.push(['clear',...x]),
    fillRect:(...x)=>operations.push(['fill',...x]),
    strokeRect:(...x)=>operations.push(['stroke',...x]),
    fillText:(...x)=>operations.push(['text',...x]),
    drawImage:(...x)=>operations.push(['draw',...x]),
    createLinearGradient:()=>({addColorStop:()=>{}}),
    save:()=>{},restore:()=>{},
  };
  return {width:544,height:416,getContext:()=>ctx};
}
global.document={createElement:name=>{assert.equal(name,'canvas');return makeCanvas();}};

(async()=>{
  const d=new RGSS3Display(makeCanvas());
  d.handle({op:'bitmap-create',args:[1,64,64]});
  d.handle({op:'bitmap-fill',args:[1,0,0,64,64,'rgba(255,0,0,1)']});
  d.handle({op:'bitmap-text',args:[1,0,0,64,40,'RUBY',1,'Arial',22,'white']});
  d.handle({op:'sprite-create',args:[2]});
  d.handle({op:'sprite-set',args:[2,'bitmap',1]});
  d.handle({op:'sprite-set',args:[2,'x',43]});
  d.handle({op:'sprite-set',args:[2,'y',81]});
  d.enabled=true;
  await d.frame();
  assert(operations.some(x=>x[0]==='draw'&&x[2]===43&&x[3]===81));
  d.handle({op:'bitmap-gradient',args:[1,0,0,20,20,'white','black',false]});
  d.handle({op:'sprite-create',args:[3]});
  d.handle({op:'sprite-set',args:[3,'window',true]});
  d.handle({op:'sprite-set',args:[3,'windowWidth',120]});
  d.handle({op:'sprite-set',args:[3,'windowHeight',72]});
  d.handle({op:'sprite-set',args:[3,'bitmap',1]});
  await d.frame();
  assert(operations.some(x=>x[0]==='stroke'),'Window frame was not rendered');
  d.reset();
  assert.equal(d.bitmaps.size,0);
  console.log('PASS: RGSS3 graphics commands create Bitmap, draw text/fill, place Sprite and render to Canvas');
})().catch(e=>{console.error(e);process.exitCode=1;});
