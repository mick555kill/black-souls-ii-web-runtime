const fs=require('node:fs');
require('./game/manifest.js');
const definitions=['adapters/graphics.js','adapters/rgss3-rpg-classes.js',
  ...gameScripts.filter(s=>s.name!=='Main').map(s=>'game/'+s.file)];
fs.writeFileSync('web/definitions.js','(function(self){\n'+definitions.map(f=>'// '+f+'\n'+fs.readFileSync(f,'utf8')).join('\n')+'\n})(Opal.top);');
