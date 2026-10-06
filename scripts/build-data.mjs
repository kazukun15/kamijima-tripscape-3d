import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const date='2026-10-05';
const official=JSON.parse(await readFile('research/official-details.json','utf8'));
const ehime=JSON.parse(await readFile('research/ehime-points.json','utf8'));
const labels=JSON.parse(await readFile('research/gsi-labels.json','utf8'));
const symbols=JSON.parse(await readFile('research/gsi-symbols-14.json','utf8'));
const records=[
  {id:'sekizen',name:'積善山',kana:'せきぜんざん',island:'岩城島',ehime:'286',official:'sekizenzan-tenbodai',categories:['絶景 / 展望','自然','季節限定'],summary:'桜の道をのぼり、瀬戸内の島々を見渡す。',description:'岩城島の中央にそびえる山。山頂の展望台からは、瀬戸内の島々を360度見渡せます。春は登山道路に沿って桜が咲く、島を代表する景観です。',sections:[['地形・自然','山頂には展望台があります。地図の印は県公式サイトが掲載する「積善山」の代表地点で、展望台入口の位置を示すものではありません。'],['季節の見どころ','春には約3,000本の桜が登山道路を彩ると公式サイトで紹介されています。開花状況は年ごとに変わります。'],['撮影のヒント','山頂から島々を見渡す風景を楽しめます。眺望や桜の状態は当日の天候・季節によります。']],season:['春'],topics:['桜','瀬戸内の眺望','島めぐり'],times:['朝','夕方'],scope:'県公式「積善山」代表地点。展望台入口ではありません。',warning:'山道の状況と桜の混雑情報を公式サイトで確認してください。'},
  {id:'kushi',name:'久司山展望台',kana:'くしやまてんぼうだい',island:'弓削島',ehime:'3102',official:'kushiyama_tenbodai',categories:['絶景 / 展望','自然'],summary:'歩いて出会う、360度の海と島。',description:'標高142mの久司山にある展望台。島の南部から周囲の海と島々を見渡せる、ハイキングの目的地です。',sections:[['地形・自然','公式観光サイトは、麓から山頂まで約15分のハイキングを紹介しています。出発点や体力、道の状態によって時間は変わります。'],['撮影のヒント','展望台で広がる360度の景観が見どころです。歩きやすい靴を選び、日没前に戻れる行程を組んでください。']],topics:['瀬戸内の眺望','島めぐり'],times:['朝','夕方']},
  {id:'matsubara',name:'松原海水浴場',kana:'まつばらかいすいよくじょう',island:'弓削島',ehime:'305',official:'matsubara',categories:['海 / 海岸 / 海水浴場','自然'],summary:'松林の先にひらける、穏やかな砂浜。',description:'法王ヶ原の前に広がる海水浴場。公式観光サイトは、環境省の快水浴場百選に選ばれた砂浜として紹介しています。',sections:[['地形・自然','隣接する法王ヶ原の松林と、海辺の景観を合わせて楽しめる場所です。'],['季節の見どころ','夏には海水浴で訪れる人がいます。海開き・利用条件・キャンプの予約は、必ず最新の公式案内を確認してください。']],topics:['松林','海辺','島めぐり'],season:['夏']},
  {id:'hoogahara',name:'法王ヶ原',kana:'ほうおうがはら',island:'弓削島',ehime:'4381',official:'yuge_jinja',categories:['歴史 / 文化財','自然','海 / 海岸 / 海水浴場'],summary:'海辺の松林から、島の物語へ。',description:'松原海水浴場に隣接する海辺の景観。弓削神社とともに公式観光サイトで紹介されています。地図には県公式の「法王ヶ原」地点を表示しています。',sections:[['歴史・文化','公式紹介では、弓削神社の鳥居が海を向いて立つことや、京都・東寺の古文書に記された濱戸宮との関係が説明されています。神社の創建を確定するものではありません。'],['人物・伝承','道鏡を祀ったという伝説が紹介されています。伝説と史実を分けて読んでください。']],topics:['松林','東寺','塩','島の歴史'],people:['道鏡'],scope:'県公式「法王ヶ原」代表地点。弓削神社の本殿位置ではありません。'},
  {id:'iwagi-museum',name:'岩城郷土館',kana:'いわぎきょうどかん',island:'岩城島',ehime:'290',official:'iwagi_kyodokan',categories:['歴史 / 文化財','島の暮らし'],summary:'島本陣の記憶と、文学の足跡。',description:'伊予松山藩の島本陣が置かれた旧三浦邸の一部を保存・修復した郷土館。建物と資料を通して岩城島の歴史をたどれます。',sections:[['歴史','旧三浦邸の御成門や部屋などを修復し、1982年に郷土館として開館したと公式紹介に記載されています。'],['人物・文化','若山牧水、吉井勇の資料を展示すると紹介されています。三浦家との関わりから、島と文学のつながりを知ることができます。']],topics:['島の歴史','文学','島めぐり'],people:['若山牧水','吉井勇'],warning:'公式ページ内で岩城港から徒歩3分と5分の記載が併存しています。歩行時間は目安として扱ってください。'},
  {id:'iwagi-center',name:'岩城観光センター',kana:'いわぎかんこうせんたー',island:'岩城島',ehime:'3505',official:'iwagi-kanko-center',categories:['買い物','食','島の暮らし'],summary:'旅の途中に、島の柑橘と出会う。',description:'リモーネプラザとして紹介される岩城島の観光施設。公式サイトでは、島の野菜や柑橘が集まる場所として案内されています。',sections:[['文化・産業','岩城島の柑橘や農産物に触れる場所。品目や販売状況は季節・営業日により異なります。']],topics:['レモン','島の暮らし','島めぐり']},
  {id:'sanshuen',name:'三秀園',kana:'さんしゅうえん',island:'生名島',ehime:'296',official:'sansyuuen-asouito',categories:['公園','歴史 / 文化財','島の暮らし'],summary:'麻生イトの足跡が残る、山の麓の公園。',description:'立石山の麓にある公園。公式紹介によれば、実業家の麻生イトが整備し、晩年を過ごした場所です。園内には巨石があります。',sections:[['人物・歴史','麻生イトは1876年に尾道で生まれ、1956年に生名島で亡くなった実業家として紹介されています。地域への寄付や三秀園の整備にも携わりました。'],['文化','三秀園の名は、安芸・備後・伊予の3州の景色に由来すると公式紹介にあります。']],topics:['島の歴史','巨石','島めぐり'],people:['麻生イト']},
  {id:'tateishi',name:'立石山',kana:'たていしやま',island:'生名島',ehime:'289',official:'mt_tateishi',categories:['絶景 / 展望','歴史 / 文化財','自然'],summary:'古代の祈りを、島の景色の中に。',description:'生名島にある山。町の公式観光紹介では、山頂に弥生時代の祭祀遺跡があるとされています。三秀園と合わせて、島の歴史をたどれます。',sections:[['歴史・文化','山頂の祭祀遺跡について公式観光サイトで紹介されています。年代や遺構の詳細は専門資料の追加確認が必要です。']],topics:['島の歴史','巨石','瀬戸内の眺望']},
  {id:'loghouse',name:'ログハウス弓削',kana:'ろぐはうすゆげ',island:'弓削島',ehime:'316',official:'roghouse-yuge',categories:['買い物','食'],summary:'海苔、塩、お菓子。島の味を持ち帰る。',description:'上島町のお土産を扱うお店。公式観光紹介には弓削のり、弓削塩、芋菓子や、周辺の島々の品物が掲載されています。',sections:[['食・産業','弓削のりや弓削塩を通じて、海と島の産物に触れられます。商品の在庫・販売条件はお店の最新案内で確認してください。']],topics:['塩','島の食','島の暮らし']},
  {id:'fespa',name:'インランド・シー・リゾートフェスパ',kana:'いんらんどしーりぞーとふぇすぱ',island:'弓削島',ehime:'3077',official:'fespa',categories:['宿泊','食'],summary:'島の旅に、海辺の滞在を。',description:'弓削島のリゾートホテル。公式観光サイトでは2026年4月のリブランドについて案内されています。宿泊プランや利用条件は施設の最新案内を確認してください。',sections:[['島で過ごす','日帰りの観光と宿泊では、移動の組み方が変わります。予約・料金・サービス内容は公式施設案内をご確認ください。']],topics:['島の暮らし','島めぐり'],warning:'宿泊料金、空室、サービスの提供状況はこの地図では確認できません。'},
  {id:'kamei-shrine',name:'亀居八幡神社',kana:'かめいはちまんじんじゃ',island:'魚島',ehime:'293',official:'kamei_hachimanjinjya',categories:['神社 / 寺','歴史 / 文化財'],summary:'漁の祈りと、島に伝わる文化財。',description:'魚島の神社。公式観光サイトは、漁師の大漁祈願や海上安全との関わりを紹介しています。花崗岩製の宝篋印塔についても案内があります。',sections:[['文化・産業','海上安全や大漁への祈りと結びついた場所として紹介されています。'],['歴史','紹介ページでは、宝篋印塔を鎌倉時代後期の国指定重要文化財としています。文化財指定の個別資料は追加照合の対象です。']],topics:['島の歴史','島の暮らし','船旅'],warning:'公式紹介の再建年には元号と西暦の不整合があります。その年代は本文に採用していません。'},
  {id:'tsuba',name:'津波島',kana:'つばじま',island:'津波島',ehime:'3608',official:'tsubajima-camping',categories:['自然','海 / 海岸 / 海水浴場','キャンプ','体験'],summary:'渡船で訪れる、静かな無人島。',description:'岩城島の南方にある無人島。公式サイトには海辺の自然や、予約して利用するキャンプ場が紹介されています。地図の印は県公式の島の代表地点です。',sections:[['自然','海に囲まれた島で、砂浜や自然を楽しむ場所として紹介されています。'],['アクセス・利用条件','キャンプ場は予約が必要で、公式紹介は渡船または自船での来島を案内しています。定期航路の徒歩移動として扱わないでください。']],topics:['海辺','船旅','島めぐり'],season:['夏'],scope:'県公式「津波島」代表地点。桟橋やキャンプ受付位置ではありません。',warning:'完全予約制。ログハウスの予約休止、水道水を生水として飲めない旨の記載があります。最新条件を予約先で確認してください。'},
  {id:'takaikami-light',name:'高井神島灯台',kana:'たかいかみじまとうだい',island:'高井神島',gsi_lighthouse:true,official:'takaikami-lighthouse',categories:['絶景 / 展望','歴史 / 文化財','島の暮らし'],summary:'船の安全を見守る、島の灯台。',description:'高井神島の北部にある灯台。町公式の紹介では1921年に設営され、気象観測も行われているとされています。',sections:[['歴史','大正10年の設営、昭和33年まで灯台守が暮らしていたことが公式紹介に記載されています。'],['文化・産業','島の学校の校章にも使われた、島のシンボルとして紹介されています。船舶の安全と島の暮らしをつなぐ場所です。']],topics:['船旅','島の歴史','島の暮らし'],scope:'国土地理院の灯台地物（ftCode 3221）の位置。島内で該当する地物1件を確認。',warning:'灯台内部への立ち入りや一般公開を保証する案内ではありません。現地の表示に従ってください。'},
  {id:'neginegi',name:'古民家ねぎねぎ',kana:'こみんかねぎねぎ',island:'佐島',official:'neginegi',published_point:true,categories:['宿泊','島の暮らし'],summary:'古民家の時間を、島で過ごす。',description:'佐島の一棟貸し古民家として公式観光サイトに掲載されている宿。高校生が運営に関わる取り組みとして紹介されています。',sections:[['島の暮らし','島に滞在することで、日帰りとは違う時間の流れに触れられます。運営・予約・利用条件は施設の最新案内で確認してください。']],topics:['島の暮らし','島めぐり']},
  {id:'richter',name:'ゲルハルト・リヒター 14枚のガラス／豊島',kana:'げるはるとりひたーじゅうよんまいのがらすとよしま',island:'豊島',official:'richter',published_point:true,categories:['アート','季節限定'],summary:'船で渡り、ガラスの作品に向き合う。',description:'THE TOYOSHIMA HOUSEに恒久展示される、ゲルハルト・リヒターのガラスの立体作品。公開期間は限定され、事前の確認が必要です。',sections:[['人物・アート','ゲルハルト・リヒターによる「14枚のガラス／豊島」を展示する施設として公式サイトで紹介されています。'],['季節・公開条件','公式ページには2026年10月3日〜25日の土・日・祝に公開する案内があります。日付を過ぎた場合や変更の可能性があるため、訪問前に公開状況を確認してください。']],topics:['アート','船旅','島めぐり'],people:['ゲルハルト・リヒター'],season:['秋'],warning:'不定期・限定公開。受付で身分証の提示などが必要と公式に記載されています。'},
  {id:'ippuku',name:'藤田住設 給食部 いっ福',kana:'ふじたじゅうせつきゅうしょくぶいっぷく',island:'弓削島',official:'ippuku',published_point:true,categories:['食'],summary:'島めぐりの途中に、石窯のピザ。',description:'石窯焼きピザのお店として町公式観光サイトに掲載されています。営業日・予約・メニューは最新の店舗案内で確認してください。',sections:[['食','公式サイトで紹介される食事の立ち寄り先です。食事時間と船の予定を合わせて行程を組んでください。']],topics:['島の食','島めぐり']},
  {id:'oyatsu',name:'おやつタイム',kana:'おやつたいむ',island:'弓削島',official:'oyatsu-time',published_point:true,categories:['食','買い物'],summary:'島のおやつで、ひと休み。',description:'町公式サイトは、かみりん焼を紹介しています。取扱商品や営業日は、訪問前にお店の最新情報で確認してください。',sections:[['食・文化','島の旅の途中で、地元のおやつを楽しむ立ち寄り先として紹介されています。']],topics:['島の食','島の暮らし']},
  {id:'michishio',name:'ゲストハウス みちしお',kana:'げすとはうすみちしお',island:'弓削島',official:'michishio',published_point:true,categories:['宿泊','島の暮らし'],summary:'丘の上から、島の暮らしに触れる。',description:'弓削島の丘の上にあるゲストハウスとして、公式観光サイトに紹介されています。予約・空室・利用条件は施設の最新情報で確認してください。',sections:[['島で過ごす','見晴らしの良い宿として公式一覧に紹介されています。宿泊する場合は帰りの航路や滞在中の移動も事前に確認してください。']],topics:['島の暮らし','瀬戸内の眺望','島めぐり']},
];
const poi=[];
for(const r of records){
  const src=official.find(p=>p.id===r.official);
  if(!src)throw new Error(`Missing official record ${r.official}`);
  const e=ehime.find(p=>p.id===r.ehime);
  let coords,coordinateSource,coordinateUrls=[];
  if(e){coords={lat:e.lat,lng:e.lng};coordinateSource='愛媛県公式観光サイト自身の地点データ（名称・ID・latitude・longitude）';coordinateUrls=[e.source,e.own_url];}
  else if(r.gsi_lighthouse){
    const candidates=symbols.filter(f=>f.properties.ftCode===3221&&f.geometry.coordinates[0]>133.26&&f.geometry.coordinates[0]<133.28&&f.geometry.coordinates[1]>34.18&&f.geometry.coordinates[1]<34.205);
    const unique=[...new Map(candidates.map(f=>[f.geometry.coordinates.join(','),f])).values()];
    if(unique.length!==1)throw new Error('Lighthouse match is not unique');
    coords={lat:unique[0].geometry.coordinates[1],lng:unique[0].geometry.coordinates[0]};coordinateSource='国土地理院・高井神島の灯台地物。公式紹介の島・種別と照合';coordinateUrls=[unique[0].properties.source_url,'https://maps.gsi.go.jp/help/pdf/vector/dataspec.pdf'];
  }else{
    // Only explicitly published single destination coordinates. Never viewport @lat/lng, embedded pb centers, shortened URLs or multi-destination URLs.
    const links=src.links.filter(l=>[...l.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)].length===1);
    if(links.length!==1)throw new Error(`Ambiguous published point: ${r.id}`);
    const m=links[0].match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    coords={lat:Number(m[1]),lng:Number(m[2])};coordinateSource='町公式紹介ページに掲載された単一地点リンクの明示座標。Googleページ・APIは取得せず、視野中心の座標は不採用';coordinateUrls=[src.url];
  }
  const sourceUrls=[src.url,...(e?[e.own_url]:[])];
  const access=src.table?.['アクセス']||'公式施設案内でアクセスを確認してください。';
  const port=access.match(/(岩城港|小漕港|長江港|弓削港|立石港|魚島港|豊島港|高井神島港|佐島港)/)?.[1]||null;
  const modes=r.island==='津波島'?['ferry']:['walking','cycling','ferry'];
  const sections=r.sections.map(([title,text])=>({title,text,source_urls:sourceUrls}));
  sections.push({title:'徒歩・自転車・船のアクセス',text:access.normalize('NFKC')+' 記載時間は公式ページの目安です。船の時刻は最新の町公式案内で確認してください。',source_urls:[src.url,'https://kamijima.info/accessmap/']});
  poi.push({id:r.id,name:r.name,name_kana:r.kana,island:r.island,categories:r.categories,coordinates:coords,coordinate_source:coordinateSource,coordinate_source_urls:[...new Set(coordinateUrls)],verification_status:r.gsi_lighthouse?'multi_source_verified':'official_verified',confidence_score:r.gsi_lighthouse?.9:.85,last_verified_at:date,content_date:src.modified?.slice(0,10)||null,reference_date:date,location_scope:r.scope||'公式掲載地点。入口・乗り場・移動経路を保証する座標ではありません。',summary:r.summary,description:r.description,deep_dive:sections,best_season:r.season||[],best_time:r.times||[],related_topics:r.topics,related_people:r.people||[],source_urls:[...new Set([...sourceUrls,...coordinateUrls])],official_links:[src.url],related_pois:[],warnings:r.warning?[r.warning]:[],tags:[...r.topics,...r.categories],access:{note:access.normalize('NFKC'),port,port_source_url:port?src.url:null,official_url:'https://kamijima.info/accessmap/',checked_at:date,modes},hours:null,closed:null,fee:null});
}
for(const p of poi)p.related_pois=poi.filter(q=>p.id!==q.id&&p.island===q.island&&p.related_topics.some(t=>q.related_topics.includes(t))).slice(0,4).map(q=>q.id);
const islandDefinitions=[
 ['yuge','弓削島','YUGE','yugejima','海辺の松林と、島の暮らしをたどる。'],
 ['sashima','佐島','SASHIMA','sashima','静かな集落と、サイクリングの島。'],
 ['ikina','生名島','IKINA','ikinajima','巨石や公園から、島の歴史に触れる。'],
 ['iwagi','岩城島','IWAGI','iwagijima','桜と柑橘、海を見渡す山の島。'],
 ['uoshima','魚島','UOSHIMA','uoshima','船で訪ねる、漁と祈りの島。'],
 ['takaikami','高井神島','TAKAIKAMI','takaikamijima','灯台とマンガ壁画を訪ねる島。'],
 ['toyo','豊島','TOYOSHIMA','toyoshima','公開日を確かめて、アートの島へ。'],
 ['tsuba','津波島','TSUBA',null,'予約と渡船で訪れる、無人島の自然。'],
];
const islands=islandDefinitions.map(([id,name,english,slug,summary])=>{
 const f=labels.find(f=>f.properties.knj===name&&f.properties.annoCtg===352);
 if(!f)throw new Error(`No official geographic label for ${name}`);
 return {id,name,english,kana:f.properties.kana||'',coordinates:f.geometry.coordinates,source_url:f.properties.source_url,summary:name==='高井神島'?'民家などに漫画の壁画が描かれる島。壁画の個別地点は未確認です。':summary,search_terms:name==='高井神島'?['漫画','マンガ','マンガアート']:[],official_url:slug?`https://kamijima.info/${slug}/`:'https://www.iyokannet.jp/spot/3608',zoom:['弓削島','岩城島'].includes(name)?12.8:13.2};
});
const promoted=new Set(records.map(r=>r.official).filter(id=>!['sekizenzan-tenbodai','yuge_jinja','tsubajima-camping'].includes(id)));
const uniqueCandidates=[...new Map(official.map(p=>[p.url,p])).values()];
const pending=uniqueCandidates.filter(p=>!promoted.has(p.id)).map(p=>({id:p.url.split('/').filter(Boolean).slice(-2).join('-'),name:p.name,island:p.island,verification_status:'pending',coordinates:{lat:null,lng:null},source_urls:[p.url],last_verified_at:date,reason:p.error?'ページ取得失敗':p.id==='sup-ikina'||p.id==='uoshima-shoten'?'一覧の島名と施設名に不整合。再確認が必要。':['sekizenzan-tenbodai','yuge_jinja','tsubajima-camping'].includes(p.id)?'周辺の山・景勝地・島は公開済み。個別施設入口の座標は未確認。':'位置・説明・公開条件の追加照合が必要。推測座標は付けていません。'}));
const topics=[
 ['桜','季節','積善山の春の景観を、山と道の関係からたどる。',['瀬戸内の眺望','島めぐり'],'sekizen'],
 ['瀬戸内の眺望','自然','積善山と久司山。それぞれの高さと視点から海を見る。',['桜','島めぐり'],'kushi'],
 ['塩','産業・食','ログハウス弓削の弓削塩から、島の産物に触れる。歴史的な製塩の年代や荘園との関係は、追加資料の照合が必要。',['東寺','島の食'],'loghouse'],
 ['東寺','歴史','公式の弓削神社紹介には、東寺の古文書と濱戸宮の関係が記されている。',['塩','島の歴史'],'hoogahara'],
 ['松林','自然・文化','法王ヶ原と松原海水浴場を、海辺の景観として一緒にたどる。',['海辺','島の歴史'],'hoogahara'],
 ['島の歴史','歴史','三秀園、岩城郷土館、島の神社。場所から人物と時代をたどる。',['文学','巨石','東寺'],'iwagi-museum'],
 ['文学','文化','若山牧水と吉井勇の資料を紹介する岩城郷土館から、島と文学の関係へ。',['島の歴史'],'iwagi-museum'],
 ['巨石','文化','三秀園の巨石と立石山の祭祀遺跡。由来や詳細には追加資料の確認が必要。',['島の歴史'],'sanshuen'],
 ['レモン','産業・食','岩城観光センターに集まる柑橘から、島の農産物を知る。',['島の食','島の暮らし'],'iwagi-center'],
 ['アート','文化','豊島の作品は公開日を確認して訪ねる。高井神島の壁画は位置未確認のため調査台帳に保持。',['船旅'],'richter'],
 ['船旅','移動','魚島、高井神島、豊島や津波島へは船の移動を計画する。時刻や運航条件は公式案内で確認。',['島めぐり'],'takaikami-light'],
 ['海辺','自然','松原海水浴場と津波島の自然。海の状態と利用条件を確認して訪ねる。',['松林','船旅'],'matsubara'],
 ['島の食','食','島で紹介されるお店や産物を、出典とともに探す。',['レモン','塩'],'loghouse'],
 ['島の暮らし','暮らし','公園、お店、宿。島の滞在を支える場所をたどる。',['島めぐり'],'neginegi'],
 ['島めぐり','島','主要8島を地図で選び、確認済みの地点を探索する。',['船旅','島の暮らし'],'sekizen'],
].map(([name,kind,summary,related_topics,id])=>({id:name,name,kind,summary,related_topics,source_urls:poi.find(p=>p.id===id).official_links}));
const stats={verified:poi.length,pending:pending.length,official_inventory:uniqueCandidates.length,additional_pois:records.filter(r=>['sekizen','hoogahara','tsuba'].includes(r.id)).length,by_island:Object.fromEntries(islands.map(i=>[i.name,poi.filter(p=>p.island===i.name).length])),checked_at:date};
await mkdir('data/poi',{recursive:true});await mkdir('public/data',{recursive:true});
for(const [path,data] of [['data/poi/verified.json',poi],['data/islands.json',islands],['data/topics.json',topics],['data/stats.json',stats],['research/pending.json',pending]])await writeFile(path,JSON.stringify(data,null,2));
await copyFile('data/poi/verified.json','public/data/poi.json');
await writeFile('public/data/pois.geojson',JSON.stringify({type:'FeatureCollection',features:poi.map(p=>({type:'Feature',properties:{id:p.id,name:p.name,island:p.island,verification_status:p.verification_status},geometry:{type:'Point',coordinates:[p.coordinates.lng,p.coordinates.lat]}}))},null,2));
console.log(stats);
