import {readFile} from 'node:fs/promises';
const d=JSON.parse(await readFile('research/official-details.json','utf8'));
console.log(d.map(x=>`${x.id} | ${x.name} | ${x.island}`).join('\n'));
console.log('\nSELECTED CONTENT');
for(const x of d.filter(x=>/sekizen|shounji|manga_|kamei|sansyu|tateishi|u-turn|yuge_jinja|kyodo|richter|tsuba/.test(x.id)))console.log(JSON.stringify(x));
