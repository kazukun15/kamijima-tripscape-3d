import {readFile,readdir,writeFile} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const notices=['# Third-party notices\n\nInstalled dependency licenses, including build/test dependencies. Versions are pinned by package-lock.json. Generated from the actual installed packages; missing platform-specific optional packages are listed in the lockfile.\n'];
const missing=[];
for(const dir of Object.keys(lock.packages).filter(p=>p.startsWith('node_modules/')).sort()){
 const pkg=JSON.parse(await readFile(`${dir}/package.json`,'utf8').catch(()=>'null'));if(!pkg)continue;
 const names=(await readdir(dir)).filter(n=>/^(licen[cs]e|copying|notice)(\.|$|-)/i.test(n));
 const texts=[];for(const name of names){const t=await readFile(`${dir}/${name}`,'utf8').catch(()=>null);if(t)texts.push(`File: ${name}\n\n${t}`);}
 if(!texts.length&&pkg.name==='murmurhash-js'){const t=await readFile(`${dir}/README.md`,'utf8');texts.push(`File: README.md, License section\n\n${t.slice(t.indexOf('## License'))}`);}
 if(!texts.length&&(pkg.name.startsWith('@esbuild/')||pkg.name.startsWith('@rollup/rollup-'))){const parent=pkg.name.startsWith('@esbuild/')?'esbuild/LICENSE.md':'rollup/LICENSE.md';const t=await readFile(`node_modules/${parent}`,'utf8').catch(()=>null);if(t)texts.push(`Parent package: ${parent}\n\n${t}`);}
 notices.push(`## ${pkg.name} ${pkg.version}\n\nLicense: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)||'See package metadata'}.\n\n${texts.length?'```text\n'+texts.join('\n\n')+'\n```':'License text not present in installed package; consult package source.'}\n`);
 if(!texts.length)missing.push({name:pkg.name,version:pkg.version,license:pkg.license});
}
const text=notices.join('\n');await writeFile('THIRD_PARTY_NOTICES.md',text);await writeFile('public/third-party-notices.txt',text);
console.log(`Generated ${notices.length-1} installed package notices. ${missing.length} lack bundled license text.`);if(missing.length)console.log(JSON.stringify(missing));
