(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const runtime=new VX.MapRuntime($('canvas'),$('status'));
  const select=$('mapSelect'),state=$('engineState'),buttons=['save','load'];
  const sources=[];          // every source picked so far (Game.rgss3a, ZIPs, folders, RTP)
  const names=[];
  let currentProject=null,rubyVM=null;
  const rgssDisplay=new VX.RGSS3Display($('rubyCanvas'),()=>currentProject);
  async function initializeRuby(){
    if(!rubyVM)rubyVM=new VX.RubyWebAssemblyVM();
    rubyVM.onRGSSCommand=command=>rgssDisplay.handle(command);
    const info=await rubyVM.initialize();
    $('rubyVersion').textContent=`Ruby ${info.version} / WASM`;
    return rubyVM;
  }
  function status(text,error=false){runtime.say(text);$('status').classList.toggle('error',error);}
  function renderSources(){
    const ul=$('sourceList');ul.replaceChildren();
    names.forEach(n=>{const li=document.createElement('li');li.textContent=n;ul.append(li);});
    $('clearSources').hidden=!names.length;
  }
  // Safari's Files picker may omit a file extension. Sniff only the first 8 bytes;
  // do not load a large RGSS3A archive into RAM.
  async function looksLikeRGSS3(file){
    if(file.size<8)return false;
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    return [82,71,83,83,65,68,0,3].every((b,i)=>bytes[i]===b);
  }
  // Turn one picked File (or a folder's FileList) into asset sources.
  async function addFile(file,mode='game'){
    status(`เลือก ${file.name} · ${(file.size/1048576).toFixed(1)} MiB · กำลังอ่านไฟล์บนอุปกรณ์...`);
    if(mode==='rtp'&&!/\.zip$/i.test(file.name))throw Error('ไฟล์ RTP ต้องเป็น .zip ที่มีโฟลเดอร์ Graphics/ หรือ Audio/');
    if(/\.rgss3a$/i.test(file.name) || await looksLikeRGSS3(file)){
      const archive=new VX.ArchiveSource(await VX.RGSS3Archive.open(file,n=>status(`พบ ${n} ไฟล์ใน Archive ...`)));
      archive.kind='game';sources.push(archive);names.push(file.name);return;
    }
    if(/\.zip$/i.test(file.name)){
      status(`กำลังอ่าน ${file.name} ...`);
      const zip=await VX.ZipContainer.open(file);
      const rtp=VX.inspectRTP(zip);
      const entry=zip.entries.find(e=>/(^|\/)Game\.rgss3a$/i.test(e.name));
      if(rtp.installer&&!rtp.usable&&!entry){
        const unpacked = await VX.RTPInnoImporter.unpack(zip, message => status(message));
        const extracted = new VX.ZipSource(unpacked, file.name + ' (Inno Setup)');
        extracted.kind = 'rtp';
        if (!extracted.names().length) throw Error('RTP unpacked but no Graphics/ or Audio/ files were indexed');
        sources.push(extracted);
        const parsed = VX.inspectRTP(unpacked);
        names.push('🗂️ RTP installer · ' + file.name + ' (' + parsed.graphics + ' ภาพ / ' + parsed.audio + ' เสียง)');
        return;
      }
      if(mode==='rtp'&&!rtp.usable)throw Error(`${file.name}: ไม่พบโฟลเดอร์ Graphics/ หรือ Audio/ ภายใน ZIP`);
      const pending=[];
      if(entry&&mode!=='rtp'){
        status(`พบ ${entry.name} · ${(entry.size/1048576).toFixed(1)} MiB`);
        const blob=await zip.unpackGame(m=>status(m));
        const archive=new VX.ArchiveSource(await VX.RGSS3Archive.open(blob));
        archive.kind='game';pending.push(archive);
      }
      const loose=new VX.ZipSource(zip,file.name);
      const rtpOnly=mode==='rtp'||(!entry&&!loose.has('Data/MapInfos.rvdata2')&&!loose.has('Data/System.rvdata2'));
      if(loose.names().length){loose.kind=rtpOnly?'rtp':'game';pending.push(loose);}
      if(!pending.length)throw Error(`${file.name}: ไม่พบ Game.rgss3a หรือโฟลเดอร์ Data/Graphics/Audio/ ใน ZIP`);
      sources.push(...pending);
      names.push(`${rtpOnly?'🗂️ RTP · ':''}${file.name}${rtpOnly?` (${rtp.graphics} ภาพ / ${rtp.audio} เสียง)`:''}`);
      return;
    }
    throw Error(`ไม่รองรับไฟล์ ${file.name} (ใช้ .rgss3a, .zip หรือเลือกโฟลเดอร์)`);
  }
  async function addFolder(files){
    const list=[...files];if(!list.length)return;
    const root=(list[0].webkitRelativePath||'').split('/')[0]||'โฟลเดอร์';
    const game=list.find(f=>/(^|\/)Game\.rgss3a$/i.test(f.webkitRelativePath||f.name));
    if(game){const archive=new VX.ArchiveSource(await VX.RGSS3Archive.open(game));archive.kind='game';sources.push(archive);}
    const folder=new VX.FolderSource(list,root);
    if(folder.names().length){folder.kind=(!game&&!folder.has('Data/MapInfos.rvdata2'))?'rtp':'game';sources.push(folder);}
    if(!game&&!folder.names().length)throw Error('โฟลเดอร์นี้ไม่มี Data/ Graphics/ หรือ Game.rgss3a');
    names.push(`📁 ${root}`);
  }
  async function start(){
    state.textContent='LOADING';state.classList.remove('ready');select.disabled=true;buttons.forEach(x=>$(x).disabled=true);
    $('rubyCompile').disabled=true;$('rubyDataLoad').disabled=true;$('titleBoot').disabled=true;
    $('rubyDataCount').textContent='ยังไม่โหลด';currentProject=null;
    if(rubyVM){try{await rubyVM.clearRGSSData();}catch(error){console.warn('Ruby database reset:',error);}}
    // RTP is always a fallback, even when the user selected it before the game.
    const combined=new VX.CompositeSource([...sources.filter(s=>s.kind!=='rtp'),...sources.filter(s=>s.kind==='rtp')]);
    if(!combined.has('Data/MapInfos.rvdata2')){
      state.textContent='WAITING';status(sources.some(s=>s.kind==='rtp')?'✅ RTP พร้อมใช้งานแล้ว — เพิ่มไฟล์ Game.rgss3a หรือ ZIP เกมเพื่อเปิดแมพ':'ยังไม่พบ Data/MapInfos.rvdata2 — เพิ่ม Game.rgss3a (หรือโฟลเดอร์/ZIP ที่มี Data/) ได้เลย',!sources.some(s=>s.kind==='rtp'));return;
    }
    status('กำลังอ่านฐานข้อมูลเกม ...');
    const project=await new VX.Project(combined).initialize();
    await runtime.setProject(project);
    let scriptError=null;
    if(combined.has('Data/Scripts.rvdata2')){
      try{project.scripts=await VX.ScriptCatalog.load(combined);}
      catch(error){scriptError=error.message;console.warn('Cannot load RGSS3 scripts:',error);}
    }
    currentProject=project;
    const ids=project.mapIds();select.replaceChildren();
    for(const id of ids){const o=document.createElement('option');o.value=id;o.textContent=`${String(id).padStart(3,'0')} — ${project.mapName(id)}`;select.append(o);}
    select.value=String(runtime.mapId);select.disabled=false;
    $('fileCount').textContent=combined.names().length.toLocaleString();
    $('mapCount').textContent=ids.length.toLocaleString();
    $('gameTitle').textContent=project.title;
    $('scriptCount').textContent=(project.scripts?.entries?.length||0).toLocaleString();
    $('rubyCompile').disabled=!project.scripts?.entries?.length;
    $('rubyDataLoad').disabled=false;
    $('titleBoot').disabled=!project.scripts?.entries?.length;
    state.textContent='PLAYABLE (PARTIAL)';state.classList.add('ready');buttons.forEach(x=>$(x).disabled=false);
    status(scriptError?`โหลดแมพแล้ว แต่แยก Ruby Scripts ไม่สำเร็จ: ${scriptError}`:`เปิด “${project.title}” แล้ว · ${project.mapName(runtime.mapId)} · Ruby Scripts ${project.scripts?.entries?.length||0} ชุด (ยังไม่รัน RGSS3 และระบบต่อสู้)`,Boolean(scriptError));
    updateReport();$('canvas').focus();
  }
  async function handle(addFn){
    try{await addFn();renderSources();await start();}
    catch(e){state.textContent='ERROR';status(`ไม่สามารถเปิดเกม: ${e.message}`,true);console.error(e);}
  }
  $('archiveFile').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await handle(async()=>{for(const f of files)await addFile(f);});});
  $('archiveFileAny').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;await handle(async()=>{for(const f of files)await addFile(f);});});
  $('rtpFile').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await handle(async()=>{for(const f of files)await addFile(f,'rtp');});});
  $('folderInput').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await handle(()=>addFolder(files));});
  $('clearSources').addEventListener('click',()=>{sources.length=0;names.length=0;currentProject=null;$('rubyCompile').disabled=true;$('rubyDataLoad').disabled=true;$('titleBoot').disabled=true;$('rubyDataCount').textContent='ยังไม่โหลด';rubyVM?.clearRGSSData().catch(console.warn);renderSources();state.textContent='WAITING';status('ล้างไฟล์ที่เลือกแล้ว');});
  $('rubyTest').addEventListener('click',async()=>{
    const button=$('rubyTest');button.disabled=true;
    status('กำลังโหลด CRuby WebAssembly ใน Worker (~31 MiB) ...');
    try{
      const vm=await initializeRuby();
      const result=await vm.eval('"Ruby " + RUBY_VERSION + " | " + (1..100).sum.to_s');
      if(!/^Ruby 3\.2\.\d+ \| 5050$/.test(result))throw Error(`Ruby ได้ผลไม่ถูกต้อง: ${result}`);
      status(`✅ Ruby WebAssembly ประมวลผลจริงแล้ว: ${result} · แมพยังใช้ JavaScript Event Interpreter`);
    }catch(error){status(`เปิด Ruby VM ไม่ได้: ${error.message} (ต้องเปิดเว็บผ่าน HTTP ไม่ใช่ file://)`,true);rubyVM?.terminate();rubyVM=null;$('rubyVersion').textContent='เริ่มไม่สำเร็จ';}
    finally{button.disabled=false;}
  });
  $('rubyDataLoad').addEventListener('click',async()=>{
    if(!currentProject)return;
    const button=$('rubyDataLoad');button.disabled=true;
    try{
      status('กำลังเปิด Ruby และอ่านฐานข้อมูล .rvdata2 ...');
      const vm=await initializeRuby();
      const importer=new VX.RGSS3DatabaseImporter(currentProject.source,vm);
      const data=await importer.load({mapId:runtime.mapId,onProgress:p=>{
        status(`กำลังสร้างออบเจ็กต์ RPG::* ใน Ruby: ${p.loaded}/${p.total} · ${p.name}`);
      }});
      $('rubyDataCount').textContent=`${data.total} ชุด`;
      status(`✅ โหลดฐานข้อมูล ${data.total} ชุดเป็นออบเจ็กต์ Ruby จริงแล้ว (เช่น RPG::Actor / RPG::Map / Table) · ยังไม่เปิด SceneManager`);
    }catch(error){status(`แปลงฐานข้อมูลเข้า Ruby ไม่สำเร็จ: ${error.message}`,true);console.error(error);}
    finally{button.disabled=!currentProject;}
  });
  $('titleBoot').addEventListener('click',async()=>{
    if(!currentProject?.scripts?.entries?.length)return;
    const button=$('titleBoot');button.disabled=true;
    try{
      // Always use a clean VM: plugin aliases and RPG constants are not safe
      // to evaluate twice inside the same Ruby global namespace.
      if(rubyVM){rubyVM.terminate();rubyVM=null;}
      $('rubyVersion').textContent='กำลังเริ่มใหม่';
      rgssDisplay.reset();rgssDisplay.enabled=true;
      status('กำลังโหลด Ruby WASM และฐานข้อมูลเกมจริง ...');
      const vm=await initializeRuby();
      const importer=new VX.RGSS3DatabaseImporter(currentProject.source,vm);
      const loaded=await importer.load({mapId:runtime.mapId,onProgress:p=>{
        status(`อ่าน RPG::* ${p.loaded}/${p.total}: ${p.name}`);
      }});
      $('rubyDataCount').textContent=`${loaded.total} ชุด`;
      const scripts=await vm.loadRGSSScripts(currentProject.scripts.entries,{onProgress:p=>{
        status(`กำลังรัน RGSS3 ของเกม: ${p.checked}/${p.total} ชุด`);
      }});
      if(scripts.errors.length){
        const first=scripts.errors[0];
        throw Error(`Script #${first.index} (${first.name}): ${first.error}`);
      }
      status('รันสคริปต์สำเร็จ กำลังเข้าสู่ลูป RGSS3 (กด A เพื่อเลือก New Game) ...');
      state.textContent='RGSS3 RUNNING';state.classList.add('ready');
      // SceneManager.run drives Input.update / Graphics.update and scene
      // transitions. A ten-frame probe only rendered a frozen Title Screen.
      // Keep this worker request pending while the game is running.
      const result=await vm.runRGSS(`
        SceneManager.run
        "SceneManager.run returned"
      `);
      status('ลูป RGSS3 จบการทำงาน: '+result);
    }catch(error){
      state.textContent='TITLE ERROR';
      status(`RGSS3 หยุดการทำงาน: ${error.message} — ดู Console สำหรับรายละเอียด`,true);
      console.error('RGSS3 title boot:',error);
    }finally{button.disabled=!currentProject?.scripts?.entries?.length;}
  });
  $('rgssDemo').addEventListener('click',async()=>{
    const button=$('rgssDemo');button.disabled=true;
    status('กำลังเปิด Ruby RGSS3 Bridge และให้ Ruby สั่งวาด Sprite ...');
    try{
      const vm=await initializeRuby();
      await vm.installRGSS();
      rgssDisplay.reset();rgssDisplay.enabled=true;
      const result=await vm.runRGSS(`
        Graphics.resize_screen(544, 416)
        Graphics.frame_count = 0
        background = Bitmap.new(220, 78)
        background.fill_rect(0, 0, 220, 78, Color.new(16, 48, 77, 210))
        background.draw_text(8, 4, 205, 34, 'RGSS3 RUBY / WASM', 0)
        label_sprite = Sprite.new
        label_sprite.bitmap = background
        label_sprite.x = 10
        label_sprite.y = 10
        square = Bitmap.new(56, 56)
        square.fill_rect(0, 0, 56, 56, Color.new(123, 240, 216))
        square.draw_text(2, 10, 52, 34, 'RUBY', 1)
        hero = Sprite.new
        hero.bitmap = square
        hero.x = 10
        hero.y = 158
        110.times do |frame|
          Graphics.update
          Input.update
          hero.x = (frame * 4) % 488
          hero.y = 158 + (Math.sin(frame / 12.0) * 45).round
          hero.x = [0, hero.x - 8].max if Input.press?(Input::LEFT)
          hero.x = [488, hero.x + 8].min if Input.press?(Input::RIGHT)
        end
        "Ruby controlled #{Graphics.frame_count} browser frames"
      `);
      status(`✅ ${result} · Bitmap/Sprite ถูกวาดบน Canvas จริงผ่าน WebAssembly · ไม่ใช่ Scene_Map ของเกม`);
    }catch(error){status(`RGSS3 Bridge Demo ไม่สำเร็จ: ${error.message}`,true);console.error(error);}
    finally{button.disabled=false;}
  });
  $('rubyCompile').addEventListener('click',async()=>{
    if(!currentProject?.scripts?.entries?.length)return;
    const button=$('rubyCompile');button.disabled=true;
    try{
      status('กำลังคอมไพล์ไวยากรณ์ Ruby ใน WebAssembly (ไม่รันเกม) ...');
      const vm=await initializeRuby();
      const result=await vm.compileScripts(currentProject.scripts.entries,{onProgress:p=>status(`ตรวจไวยากรณ์ Ruby ${p.checked}/${p.total} · ข้อผิดพลาด ${p.errors}`)});
      if(result.errors.length){console.warn('Ruby compatibility:',result.errors);status(`ตรวจผ่าน ${result.passed}/${result.total} · อ่านไม่ได้ ${result.errors.length} ชุด (รายละเอียดใน Console)`,true);}
      else status(`✅ Ruby WebAssembly คอมไพล์ไวยากรณ์ผ่าน ${result.passed}/${result.total} ชุด · ยังไม่รัน API RGSS3`);
    }catch(error){status(`ตรวจ Ruby ไม่สำเร็จ: ${error.message}`,true);rubyVM?.terminate();rubyVM=null;}
    finally{button.disabled=!currentProject?.scripts?.entries?.length;}
  });
  const drop=$('importLabel');
  ['dragover','dragenter'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(t=>drop.addEventListener(t,()=>drop.classList.remove('over')));
  drop.addEventListener('drop',async e=>{e.preventDefault();const files=[...e.dataTransfer.files];await handle(async()=>{for(const f of files)await addFile(f);});});
  select.addEventListener('change',async()=>{try{await runtime.switchMap(Number(select.value));}catch(e){status(e.message,true);}});
  $('save').addEventListener('click',()=>{try{runtime.save();}catch(e){status(e.message,true);}});
  $('load').addEventListener('click',async()=>{try{await runtime.load();select.value=String(runtime.mapId);}catch(e){status(e.message,true);}});
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else if($('screen').requestFullscreen)await $('screen').requestFullscreen();else status('เบราว์เซอร์นี้ไม่รองรับการขยายเต็มจอ');}
    catch{status('ไม่สามารถเปิดเต็มจอบนอุปกรณ์นี้ได้',true);}
  });
  // compatibility report: which event commands / images the game needs but we cannot provide
  function updateReport(){
    const r=runtime.report(),box=$('report');
    const cmds=Object.entries(r.unsupported).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>`${k} ×${v}`);
    box.textContent=(cmds.length?`คำสั่ง Event ที่ข้ามไป: ${cmds.join(', ')}\n`:'ยังไม่พบคำสั่งที่ข้าม\n')+(r.missing.length?`ภาพที่หาไม่เจอ (${r.missing.length}): ${r.missing.slice(0,8).join(', ')}${r.missing.length>8?' …':''}\n→ เพิ่มโฟลเดอร์ RTP หรือไฟล์ภาพที่ขาดด้านบน`:'ภาพครบตามที่ใช้ไปแล้ว');
    const goat='Graphics/Characters/!$ヤギ';
    if(r.missing.some(path=>path===goat||path.startsWith(goat+'.'))){
      const matching=sources.flatMap(source=>(source.names?.()||[]).filter(n=>n.toLowerCase().includes('ヤギ')));
      box.textContent+='\n🔎 !$ヤギ: '+(matching.length?'พบชื่อคล้ายกัน: '+matching.slice(0,6).join(', '):'ยังไม่พบไฟล์ชื่อ ヤギ ในแหล่งที่นำเข้า (ตรวจ Game.rgss3a และโฟลเดอร์เกม)');
    }
    if(r.routeScripts?.length)box.textContent+='\nroute:45 ล่าสุด (ยังไม่รัน Ruby):\n'+r.routeScripts.slice(-8).map(x=>'Map '+x.mapId+' Event '+(x.eventId??'?')+' ['+x.x+','+x.y+'] '+x.script).join('\n');
  }
  setInterval(()=>{if(runtime.project)updateReport();},1500);
  const keyMap={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right',Enter:'ok',z:'ok',' ':'ok',Escape:'cancel',x:'cancel'};
  document.addEventListener('keydown',e=>{
    if(['SELECT','INPUT','TEXTAREA','BUTTON'].includes(e.target?.tagName)&&e.key!==' '&&!e.key.startsWith('Arrow'))return;
    if(['SELECT','INPUT','TEXTAREA'].includes(e.target?.tagName))return;
    const key=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(!key)return;
    e.preventDefault();runtime.input(key,true);
    rubyVM?.setInput(key,true);
  });
  document.addEventListener('keyup',e=>{const key=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(key){e.preventDefault();runtime.input(key,false);rubyVM?.setInput(key,false);}});
  $('canvas').addEventListener('pointerdown',()=>{runtime.input('ok',true);rubyVM?.setInput('ok',true);setTimeout(()=>{runtime.input('ok',false);rubyVM?.setInput('ok',false);},60);});
  const activePointers=new Map();
  document.querySelectorAll('.gamepad button[data-key]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);activePointers.set(e.pointerId,button.dataset.key);runtime.input(button.dataset.key,true);rubyVM?.setInput(button.dataset.key,true);button.classList.add('pressed');});
    const release=e=>{
      const key=activePointers.get(e.pointerId);if(!key)return;
      activePointers.delete(e.pointerId);
      if(![...activePointers.values()].includes(key)){runtime.input(key,false);rubyVM?.setInput(key,false);}
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  window.addEventListener('blur',()=>{activePointers.clear();runtime.keys.clear();for(const key of ['up','down','left','right','ok','cancel'])rubyVM?.setInput(key,false);document.querySelectorAll('.gamepad button').forEach(b=>b.classList.remove('pressed'));});
})();
