# BLACK SOULS II Web Runtime — v0.9 (mkxp-z RGSS3 Title Boot)

โปรเจกต์ JavaScript/Canvas สำหรับเปิดเกม RPG Maker VX Ace ในเบราว์เซอร์ ใช้ระบบแมพ/Event ที่พัฒนาต่อจากต้นฉบับ 0.3 และ CRuby 3.2 WebAssembly จาก [ruby.wasm](https://github.com/ruby/ruby.wasm) โดยเพิ่มนิยามคลาส RPG::* ต้นฉบับจาก [mkxp-z](https://github.com/mkxp-z/mkxp-z) ในรุ่นนี้ ไม่รวมข้อมูลเกมหรือ RTP ของผู้อื่น

**สถานะตรงไปตรงมา:** v0.9 รันโค้ดระดับบนสุดจากสคริปต์จริง `Scripts.rvdata2` ของ BLACK SOULS II ได้ **223/223 ชุด** (ข้าม `Main` ซึ่งจะเข้าลูปเกมไม่สิ้นสุด) จากนั้นใช้ข้อมูล `System.rvdata2` ของเกมเรียก **`Scene_Title.new.start` และอัปเดต 10 เฟรมใน CRuby WebAssembly ได้สำเร็จ** ใน Node Worker test. มีปุ่มทดลอง Title บนเบราว์เซอร์แล้ว แต่ยังไม่ได้ทดสอบหน้าจอจริงด้วยชุดไฟล์ภาพเกมครบใน Chrome/Safari; จึง **ยังไม่รับรองว่า Title แสดงครบหรือกด New Game เล่นได้** และยังไม่ใช่ตัวเล่นเกมเต็มรูปแบบ

**ทดสอบกับข้อมูลจริงที่คุณเคยแนบ:** Ruby/WASM อ่าน 410 ไฟล์แมพได้ **410/410**, โหลด `System.rvdata2` (`start_map_id=185`) และสคริปต์ 224 รายการ (223 ตัวโหลดจริง + Main เก็บไว้สำหรับอนาคต) การทดสอบ `Scene_Title.start` ผ่านบนข้อมูลเกมที่มี **System และ Scripts**; ยังไม่มีชุดภาพพื้นหลัง/ฐานข้อมูล Actors/Items/Classes ทั้งหมดในการทดสอบ Node นี้

## ใหม่ใน v0.9 — เปิดฉาก Title Screen

- `vendor/mkxp-z/rgss3-rpg-classes.rb`: นิยามคลาส `RPG::*` ตามซอร์ส RGSS3 ของ mkxp-z (decode จาก `binding/module_rpg3.rb.xxd` ตามต้นฉบับ) พร้อม `COPYING` ลิขสิทธิ์ GPL-2.0-or-later ของโครงการ
- `src/ruby-worker.js`: คำสั่ง `rgss-load-scripts` สั่ง **evaluate** สคริปต์จริงตามลำดับ รองรับรายงานจุดแรกที่รันไม่ผ่าน ไม่เรียก `Main` อัตโนมัติ
- RGSS3 API ที่เพิ่มจากการทดสอบจริง: `Bitmap.gradient_fill_rect`, `Bitmap.rect`, `Bitmap.get_pixel` แบบ fallback, `Rect#set(Rect)`, `Tone#set(Tone)`, `Color#set(Color)`, `Graphics.play_movie` สำหรับตรวจเวอร์ชัน; stub Steam DLL คืนค่าไม่พร้อมใช้งานอย่างปลอดภัย
- **ปุ่ม ▶ บูต BLACK SOULS II Title Screen:** โหลดฐานข้อมูลเข้า Ruby, รัน 223 สคริปต์, `DataManager.create_game_objects`, `Scene_Title.new.start` และ `Scene_Title.update` 10 เฟรม; ส่งภาพ Bitmap/Sprite/หน้าต่างคำสั่งเข้าสู่ Canvas
- `src/rgss3-display.js`: หน้าต่างคำสั่งแบบทดลอง, แสดง `Sprite.ox/oy`, วาด Gradient, รองรับภาพโหลดทีหลังแล้วค่อยวาด `blt`/`stretch_blt`
- ระวัง: `Win32API` จำกัดเฉพาะตัวแจ้งว่าปลั๊กอิน Steam เริ่มไม่ได้; **ไม่มี Steamworks จริง** / Movie playback ยังไม่รองรับ / สีจาก `Bitmap.get_pixel` เป็น fallback ขาว และหน้าต่างยังวาดไม่เหมือน RGSS3 ต้นฉบับ

## ใหม่ในรุ่น 0.8

- เพิ่ม `src/rgss3-rpg.rb` กำหนดคลาส Ruby `RPG::*` ที่ใช้ในฐานข้อมูล VX Ace รวมทั้งคลาสย่อย `RPG::BaseItem::Feature`, `RPG::UsableItem::Effect` และ `RPG::UsableItem::Damage`
- ใช้ `Marshal.load` ใน **CRuby WebAssembly จริง** กับข้อมูล `.rvdata2` ต้นฉบับ เพื่อคง Ruby class, array/hash และ references; ไม่ใช่แค่ JSON ที่ติดชื่อ `__class`
- เพิ่มการอ่าน `Table._load` (ตาราง Int16), `Color._load`, `Tone._load`, `Rect._load` และรองรับ Marshal dump/load กลับในกรณีที่ทดสอบ
- `src/rgss3-data.js` โหลดฐานข้อมูลที่พบ ได้แก่ Actors, Classes, Skills, Items, Weapons, Armors, Enemies, Troops, States, Animations, Tilesets, CommonEvents, System, MapInfos, Scripts พร้อมแมพปัจจุบัน
- ปุ่ม **📚 โหลด .rvdata2 เป็น RPG::* ใน Ruby** ส่งไบต์ข้อมูลเข้า Web Worker แล้วกำหนดตัวแปร `$data_actors`, `$data_items`, `$data_map` ฯลฯ ให้ใช้ใน Ruby; `load_data('Data/Actors.rvdata2')` ก็ใช้ข้อมูลที่โหลดแล้วได้
- เพิ่มการทดสอบกับ Web Worker + CRuby/WASM โดยตรวจคลาส ฟิลด์ ตาราง และการล้างฐานข้อมูลแล้วโหลดใหม่ รวมทั้งป้องกันชื่อไฟล์ไม่ถูกต้อง

## สิ่งที่สืบทอดมาจาก 0.7

- **RGSS3 Ruby Bootstrap:** `src/rgss3-bootstrap.rb` สร้าง `Graphics`, `Input`, `Audio`, `Bitmap`, `Sprite`, `Color`, `Tone`, `Rect`, `Font` และ `Viewport`/`Plane`/`Window`/`Table` แบบจำกัด
- **Ruby → Worker → JavaScript → Canvas:** `src/rgss3-display.js` วาด Bitmap/Sprite ที่สร้างโดย Ruby ลง Canvas ซ้อนบนแผนที่; `Graphics.update` รอเฟรมจริงจาก `requestAnimationFrame` โดยไม่บล็อก UI
- **ทดสอบจริง:** `tests/rgss-direct.cjs`, `tests/rgss-display.cjs` และ `tests/worker-vm.cjs` ทดสอบการเชื่อมคำสั่งจาก Ruby WASM ผ่าน Worker จนถึง Canvas แบบจำลอง
- **ปุ่มเดโม:** **🎮 ให้ Ruby วาดและขยับ Sprite บน Canvas** — กดแล้ว Ruby สร้างและขยับภาพบน Canvas โดยตรง; ลองกดซ้าย/ขวาระหว่างเดโม

### สิ่งที่สืบทอดมาจาก 0.6

- เก็บระบบ Autotile A1–A4, ภาพตัวละคร, สวิตช์, NPC, Event, การย้ายแผนที่และเซฟ/โหลดจากรุ่น 0.3 ครบ
- เพิ่ม `vendor/ruby/ruby+stdlib.wasm` (CRuby 3.2.4) และ browser adapter พร้อม LICENSE/NOTICE
- เพิ่ม `src/ruby-worker.js`, `src/ruby-vm.js`, `src/scripts.js` สำหรับรัน Ruby ใน Worker และคอมไพล์ไวยากรณ์สคริปต์จาก `Data/Scripts.rvdata2` โดยไม่รันสคริปต์เกม
- เพิ่มปุ่ม **เปิด Ruby VM และทดสอบโค้ด** (ควรได้ `Ruby 3.2.4 | 5050`) และปุ่มตรวจไวยากรณ์ Ruby Script ทั้งหมด
- Ruby VX Ace เดิมอ้างอิง 1.9.2 แต่ตัว VM ใหม่เป็น 3.2.4: ผลตรวจไวยากรณ์ผ่านไม่ได้แปลว่า RGSS3 ทุกฟังก์ชันเข้ากันได้

## วิธีใช้บน Windows 11

1. แตก ZIP ของโปรเจกต์นี้ และเปิด PowerShell ในโฟลเดอร์ `vxace_mkxp_boot_v0_9`
2. หากติดตั้ง Node.js แล้วให้รัน `node tests/server.cjs`; หากไม่มี Node แต่มี Python ให้รัน `py -m http.server --bind 127.0.0.1 8000`
3. เปิด `http://127.0.0.1:8000/` ด้วย Chrome หรือ Edge (**อย่าเปิด `index.html` ด้วย `file://` เพราะ Web Worker ต้องโหลด WASM ผ่าน HTTP**)
4. กด **เปิด Ruby VM และทดสอบโค้ด** เพื่อรัน Ruby WebAssembly (ไฟล์ WASM ประมาณ 31 MiB) แล้วกด **🎮 ให้ Ruby วาดและขยับ Sprite บน Canvas** เพื่อทดสอบ Ruby → RGSS3 → Canvas
5. ลองก่อนด้วย `tests/sample.rgss3a` (แผนที่ตัวอย่างที่สร้างเอง: NPC มีตัวเลือก, ประตูที่เปิดด้วยสวิตช์, หีบ, ถ้ำ)
6. เลือก `tests/sample.rgss3a` หรือเกมจริง: `Game.rgss3a`, ZIP ที่มี `Game.rgss3a`, หรือ **โฟลเดอร์เกมที่แตกไฟล์แล้ว** (มี `Data/` และ `Graphics/`) เลือกได้หลายแหล่งพร้อมกัน เช่น เกม + โฟลเดอร์ RTP
7. สำหรับการทดลอง Title: เลือกโฟลเดอร์ที่มี `Data/` และ `Graphics/Titles1`, `Graphics/Titles2`, `Graphics/System` **หรือ** เลือก `Game.rgss3a` ที่มีทุกไฟล์ และเพิ่ม RTP ถ้าขาด
8. กด **▶ บูต BLACK SOULS II Title Screen (RGSS3 จริง)** รอโหลด 223 สคริปต์และอัปเดต 10 เฟรม ถ้าภาพ/เมนูไม่ขึ้นดูข้อความผิดพลาดใต้ปุ่ม แล้วแจ้งกลับมา (ยังเล่นต่อจาก Title ไม่ได้)
9. หาก PowerShell ขึ้นว่า `node` ไม่รู้จัก ให้ติดตั้ง Node.js หรือใช้ `py -m http.server --bind 127.0.0.1 8000` หากเครื่องมี Python
10. ปุ่มแผนที่โหมดเดิม: ลูกศร/WASD เดิน · Enter/Z/Space ใช้งาน · Esc/X ยกเลิก

### ถ้าภาพขาด (แผนที่เป็นสี่เหลี่ยมสี)
เกมจำนวนมากไม่แถมไฟล์ RTP มาด้วย ดูกล่อง "รายงานความเข้ากันได้" ในแถบข้าง จะแสดงภาพที่หาไม่เจอ ให้เพิ่ม **โฟลเดอร์ RTP** ที่มี `Graphics/Tilesets`, `Graphics/Characters` ฯลฯ ผ่านปุ่ม "เลือกโฟลเดอร์" (RTP ต้องเป็นของที่คุณมีสิทธิ์ใช้ ซึ่งโปรเจกต์นี้ไม่รวมมาให้)

## รองรับแล้ว

- **ไฟล์:** RGSSAD v3 (`.rgss3a`), ZIP (STORE/DEFLATE, ชื่อไฟล์ UTF-8/Shift-JIS), โฟลเดอร์, รวมหลายแหล่ง, ค้นหาไฟล์แบบไม่สนตัวพิมพ์, ภาพ png/jpg
- **แผนที่:** Autotile A1–A4 (พื้น/กำแพง/น้ำตก, น้ำเคลื่อนไหว 3 เฟรม), Tileset A5 และ B–E (โครงหน้าถูกต้อง), ชั้นภาพ + แฟลกดาว (วาดทับตัวละคร) + เงา, Parallax, กล้องตามผู้เล่น
- **การชน:** Tile flags 4 ทิศ (รวม Tile event, Counter), ชนกับ Event ระดับเดียวกับตัวละคร
- **ตัวละคร:** ภาพจาก `Graphics/Characters` (รูปแบบ `$` และ `!`), ตัวละครผู้เล่นจาก Actors/System, เดินลื่นพร้อมอนิเมชัน, Event เดินสุ่ม/เข้าหา/Custom route
- **Event:** เลือกหน้าตามเงื่อนไข (สวิตช์ 1–2, ตัวแปร, Self Switch, ไอเทม, ตัวละคร), ทริกเกอร์ปุ่ม/สัมผัสผู้เล่น/สัมผัส Event/Autorun/Parallel, Common Event (Autorun/Parallel)
- **คำสั่ง Event:** Show Text (หน้าตา \V \N \P \G), Show Choices, Control Switches/Variables/Self Switch, Conditional Branch (สวิตช์ ตัวแปร Self Switch ทิศทาง เงิน ไอเทม ปุ่ม), Loop/Break, Label/Jump, Exit, Erase Event, Common Event, Gold/Items, Transfer Player (ตรง/ผ่านตัวแปร, เฟดจอ), Set Event Location, Set Move Route, Wait, Fade, Transparency; การต่อสู้ถูกนับว่า "ชนะ" พร้อมแจ้งผู้เล่น
- **รายงานความเข้ากันได้:** คำสั่ง Event ที่ถูกข้าม (พร้อมจำนวนครั้ง) และภาพที่หาไม่เจอ ไม่ซ่อนข้อบกพร่องเงียบ ๆ
- **เซฟ:** สวิตช์ ตัวแปร Self Switch เงิน ไอเทม แผนที่ และตำแหน่ง (Local Storage แยกตามชื่อเกม)
- **Ruby database:** กำหนด `RPG::*` ตาม Marshal จริงสำหรับฐานข้อมูลที่รองรับ + โครงสร้าง `Table`, `Color`, `Tone`, `Rect`; Ruby อ่าน `$data_*` และ `load_data` ได้หลังโหลดผ่านปุ่ม

## ยังไม่รองรับ

- ลูปเกมแบบ `SceneManager.run` เต็มรูปแบบ: v0.9 เรียก `Scene_Title.start` + 10 updates แต่ยังไม่เปิด `Main`/รองรับการกด New Game เพื่อเล่นต่อ
- ระบบต่อสู้, เมนู, ร้านค้า, ใส่ชื่อ, สถานะ/ค่าพลังตัวละคร
- Picture, Tint/Flash/Shake, Animation/Balloon, Weather ในโหมดเล่นเกมดั้งเดิม; มี Audio bridge แบบทดลองเฉพาะ Ruby เดโม แต่ยังไม่รองรับเสียงเกมทั้งหมด
- แผนที่แบบวนซ้ำ (loop), ยานพาหนะ, Followers, Region/Bush/Ladder
- `.rgssad` ของ XP, `.rgss2a` ของ VX, ZIP64/ZIP มีรหัสผ่าน, ไฟล์เดี่ยวใหญ่กว่า 64 MiB
- เกมที่ใช้รูปแบบดัดแปลง/เข้ารหัสเพิ่ม

## ข้อควรระวังด้านความถูกต้อง

- ตารางรูปทรง Autotile (47 รูปแบบพื้น, 16 รูปแบบกำแพง, 4 รูปแบบน้ำตก) อ้างอิงจากโครงสร้างที่ตรวจความสอดคล้องด้วย `tests/autotile.cjs` และเทียบกับการเขียนซ้ำแบบโอเพนซอร์สอีกแห่ง **ยังไม่ได้เทียบกับภาพจากเกมจริง** ถ้าขอบพื้น/กำแพงบางแบบวาดผิดทิศ ให้รายงานรหัสไทล์ ซึ่งแก้ได้ที่ตาราง `FLOOR`/`WALL` ใน `src/autotile.js`
- อนิเมชันน้ำ (A1) ใช้ 3 เฟรมที่ 30 เฟรมต่อภาพ เป็นค่าประมาณ

## บั๊กที่แก้ไปใน 0.3 (มีผลกับเกมจริง)

- `Table#at(x)` ของตาราง 1 มิติ (Tile flags) คืน 0 เสมอ ทำให้ 0.2 ถือว่าทุกช่องเดินผ่านได้
- เลย์เอาต์ Tileset B–E ผิด (ใช้ 16 คอลัมน์ ของจริงเป็น 2 ครึ่ง × 8 คอลัมน์)
- Marshal `U` (marshal_load) ลงทะเบียนอ็อบเจกต์ผิดลำดับ ทำให้ลิงก์อ้างอิงเพี้ยน; Float `inf/nan` และไบต์ท้าย
- การเดินไม่ข้ามไทล์ชั้น 0 ที่ว่าง (id 0) ในการตรวจการชน

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/archive.js` | อ่าน RGSSAD v3 แบบแบ่งส่วน |
| `src/zip.js` | อ่านสารบัญ ZIP และเปิดไฟล์ STORE/DEFLATE |
| `src/assets.js` | แหล่งไฟล์ที่รวมกันได้: Archive / ZIP / โฟลเดอร์ |
| `src/marshal.js` | Ruby Marshal 4.8 และ RGSS `Table` |
| `src/autotile.js` | ประกอบไทล์ A1–A5, B–E |
| `src/game.js` | สถานะเกม, ตัวละคร/เส้นทางเดิน, ตัวแปล Event |
| `src/runtime.js` | โหลดโปรเจกต์, แผนที่, ทริกเกอร์, หน้าต่างข้อความ, เรนเดอร์ |
| `src/app.js` | UI, ไฟล์/โฟลเดอร์/ลากวาง, คีย์บอร์ดและปุ่มสัมผัส |
| `src/scripts.js` | แยกและคลาย Ruby Scripts ทั้งหมดจากฐานข้อมูลของเกม |
| `src/ruby-vm.js`, `src/ruby-worker.js` | เชื่อมหน้าจอเว็บกับ CRuby WebAssembly ใน Worker |
| `src/rgss3-bootstrap.rb` | RGSS3 Ruby API บางส่วน ใช้ `require 'js'` ส่งคำสั่งไป Browser |
| `src/rgss3-rpg.rb` | คลาส RPG::* และ Ruby Marshal adapter สำหรับ .rvdata2 |
| `src/rgss3-data.js` | อ่าน .rvdata2 จากเกมและโหลดเข้า Ruby Web Worker |
| `src/rgss3-display.js` | แสดง Bitmap/Sprite ที่ Ruby สั่งวาดบน Canvas และเชื่อมเสียงแบบทดลอง |
| `vendor/ruby/` | ไบนารี WebAssembly, JavaScript adapter และประกาศสิทธิ์ใช้งาน |
| `tests/server.cjs` | เว็บเซิร์ฟเวอร์สำหรับ Windows/Node.js |

## ทดสอบด้วย Node.js 18+

```sh
node tests/autotile.cjs
node tests/smoke.cjs
node tests/generate-sample.cjs   # สร้าง tests/sample.rgss3a ใหม่
node tests/wasm-vm.cjs ../Game.rgss3a
node tests/worker-vm.cjs ../Game.rgss3a
node tests/rgss-direct.cjs
node tests/rgss-display.cjs
node tests/worker-vm.cjs         # ทดสอบโหลด .rvdata2 -> Ruby class จริงจากแผนที่ตัวอย่าง
# หากมีไฟล์ต้นฉบับที่คุณเคยส่งไว้แยกต่างหาก:
node tests/worker-vm.cjs --maps path/to/Data.zip --scripts path/to/Scripts.rvdata2 --system path/to/System.rvdata2
node tests/worker-vm.cjs --system path/to/System.rvdata2 --execute-scripts path/to/Scripts.rvdata2 --title-probe
node tests/real-merge.cjs ../Game.rgss3a
node tests/http-smoke.cjs
```

`smoke.cjs` เล่นแผนที่ตัวอย่างแบบไม่มีหน้าจอ: เดิน ชน คุยกับ NPC เลือกตัวเลือก เปิดประตูด้วยสวิตช์ เก็บหีบ ย้ายแผนที่ไป-กลับ เซฟ/โหลด

## ขั้นต่อไป (เรียงตามผลต่อความเล่นได้จริง)

1. ทดสอบ Title Canvas ในเบราว์เซอร์ด้วยไฟล์เกมครบ และปรับการวาดพื้นหลัง/เมนูให้ตรงต้นฉบับ
2. เปิด `SceneManager.run` แบบโต้ตอบ และพัฒนา `Tilemap`, `Window`/`Viewport` ที่ทำงานจริง พร้อม Game Data ทั้งหมด
3. เพิ่ม Picture, Tint/Flash/Shake, Audio ที่อ่านจาก Archive พร้อมเสียงรูปแบบที่เกมใช้
4. เมนู, ระบบต่อสู้, ร้านค้า, ใส่ชื่อ และคำสั่ง Event ที่พึ่งสคริปต์ Ruby
5. ทดสอบการเล่น BLACK SOULS II บน Chrome/Android/Safari/iOS จริงให้ครบทุกช่วงเกม

## แหล่งอ้างอิงรูปแบบไฟล์

- Ruby Marshal: https://docs.ruby-lang.org/en/master/marshal_rdoc.html
- RGSSAD v3: https://docs.rs/rpgmad-lib/latest/src/rpgmad_lib/lib.rs.html
- โครงการต้นฉบับที่ผู้ใช้ส่งมา: https://github.com/qnighy/tapir (ใช้ศึกษาแนวคิด ไม่ได้คัดลอกโค้ด)
- โค้ด RGSS3/`RPG::*` ที่นำมาใช้: https://github.com/mkxp-z/mkxp-z (`binding/module_rpg3.rb.xxd`); มีสำเนา `vendor/mkxp-z/COPYING`
- การเขียนซ้ำ RGSS3 Tilemap แบบโอเพนซอร์ส (rgss3 gem) ใช้เทียบโครงสร้างตารางรูปทรง Autotile เท่านั้น

## สิทธิ์การใช้งาน

ไม่รวม `RPGVXAce_RTP.zip`, `Game.rgss3a`, `Scripts.rvdata2` ของเกม หรือไฟล์ติดตั้ง `.exe` โค้ด RPG classes ที่นำจาก mkxp-z อยู่ภายใต้ใบอนุญาต GPL-2.0-or-later ตาม upstream; การนำส่วนนี้ไปแจกจ่ายต่อควรปฏิบัติตามข้อกำหนด GPL และคงประกาศลิขสิทธิ์ไว้
