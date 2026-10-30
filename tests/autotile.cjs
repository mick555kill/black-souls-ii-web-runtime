// Structural check of the autotile tables: every quarter must be a legal piece for its position,
// the implied neighbour configuration must agree between quarters, and all 47 shapes must be distinct.
const assert=require('node:assert/strict');
const {FLOOR,WALL}=require('../src/autotile.js');
function describe(q,pos){ // pos 0 TL,1 TR,2 BL,3 BR -> {h,v,d} presence of horizontal/vertical/diagonal neighbour
  const qx=q%4,qy=q>>2,right=pos%2===1,bottom=pos>=2;
  if(qy<2){ // inner-corner notch piece must sit in the matching corner
    assert.equal(qx,right?3:2,`notch col q=${q} pos=${pos}`);assert.equal(qy,bottom?1:0,`notch row q=${q} pos=${pos}`);
    return {h:true,v:true,d:false};
  }
  const hOuter=right?3:0,vOuter=bottom?5:2; // straight-edge/fill pieces may come from either inner column/row
  const hIn=qx===1||qx===2,vIn=qy===3||qy===4;
  assert(qx===hOuter||hIn,`col q=${q} pos=${pos}`);assert(qy===vOuter||vIn,`row q=${q} pos=${pos}`);
  return {h:hIn,v:vIn,d:hIn&&vIn};
}
const seen=new Set();
FLOOR.slice(0,47).forEach((e,i)=>{
  const [tl,tr,bl,br]=e.map((q,p)=>describe(q,p));
  // left neighbour present for TL and BL alike, etc.
  assert.equal(tl.h,bl.h,`left side shape ${i}`);assert.equal(tr.h,br.h,`right side shape ${i}`);
  assert.equal(tl.v,tr.v,`top side shape ${i}`);assert.equal(bl.v,br.v,`bottom side shape ${i}`);
  const key=[tl.h,tr.h,tl.v,bl.v,tl.h&&tl.v?tl.d||(e[0]>>2<2):'-',0].join();
  const cfg=JSON.stringify({L:tl.h,R:tr.h,T:tl.v,B:bl.v,tl:e[0]===2,tr:e[1]===3,bl:e[2]===6,br:e[3]===7});
  assert(!seen.has(cfg),`duplicate config at shape ${i}`);seen.add(cfg);
});
assert.equal(seen.size,47);
assert.equal(WALL.length,16);
console.log('PASS: 47 floor autotile shapes are consistent and distinct; 16 wall shapes present');
