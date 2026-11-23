// Check the actual Sprite_Base plugin against every pattern used by the imported database.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
require('./vendor/opal.js');require('./vendor/compiler.js');require('./adapters/generated.js');
for(const file of ['host','images','definitions','archive','marshal','data'])
 vm.runInThisContext(fs.readFileSync('web/'+file+'.js','utf8'),{filename:file});
(async()=>{
 const archive=await VX.RGSS3Archive.open(await fs.openAsBlob(process.argv[2]));
 const animations=new VX.MarshalReader(await archive.read('Data/Animations.rvdata2')).parse();
 const tested=new Set(),parent=Opal.Sprite_Base.$new(),sprite=Opal.Sprite.$new();
 parent.ani_bitmap1=Opal.Bitmap.$new(960,3840);parent.ani_bitmap2=Opal.Bitmap.$new(960,3840);
 parent.ani_sprites=[sprite];parent.ani_ox=parent.ani_oy=0;parent.ani_mirror=false;
 for(const a of animations.filter(Boolean))for(const frame of a.frames){
  const cells=frame.cell_data;
  for(let i=0;i<cells.width;i++){
   const pattern=cells.at(i,0);if(pattern<0||tested.has(pattern))continue;
   parent.$animation_set_sprites({$cell_data:()=>({'$[]':(_,field)=>cells.at(i,field)})});
   assert.equal(sprite.bitmap,pattern<100?parent.ani_bitmap1:parent.ani_bitmap2);
   assert.deepEqual([sprite.src_rect.x,sprite.src_rect.y,sprite.src_rect.width,sprite.src_rect.height],
    [pattern%5*192,Math.floor(pattern%100/5)*192,192,192]);
   assert.equal(sprite.zoom_x,cells.at(i,3)/100);
   tested.add(pattern);
  }
 }
 const character=Opal.Sprite_Character.$allocate();
 character.tile_id=0;character.cw=32;character.ch=32;character.src_rect=Opal.Rect.$new();
 for(let index=0;index<8;index++)for(const direction of [2,4,6,8])for(let step=0;step<3;step++){
  character.character={$character_index:()=>index,$pattern:()=>step,$direction:()=>direction};
  character.$update_src_rect();
  assert.deepEqual([character.src_rect.x,character.src_rect.y],[(index%4*3+step)*32,(Math.floor(index/4)*4+(direction-2)/2)*32]);
 }
 console.log('96 character poses passed');
 assert([...tested].some(p=>p>=100));console.log(tested.size+' distinct animation patterns passed across both sheets');
})().catch(e=>{console.error(e);process.exitCode=1});
