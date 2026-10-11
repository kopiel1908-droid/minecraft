import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8" };

function send(res,status,body,type="application/json; charset=utf-8"){
  res.writeHead(status,{"Content-Type":type,"X-Content-Type-Options":"nosniff"});
  res.end(typeof body==="string"||Buffer.isBuffer(body)?body:JSON.stringify(body,null,2));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let data="";
    req.on("data",chunk=>{data+=chunk;if(data.length>1_000_000){reject(new Error("Żądanie jest za duże."));req.destroy();}});
    req.on("end",()=>{try{resolve(JSON.parse(data||"{}"));}catch{reject(new Error("Nieprawidłowy JSON."));}});
    req.on("error",reject);
  });
}
function safeName(value){
  return String(value||"my_addon").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40)||"my_addon";
}
function displayName(description){
  const first=String(description||"").split(/[.!?\n]/)[0].trim();
  return first.slice(0,40)||"Mój dodatek";
}
function zipDirectory(sourceDir,zipPath){
  const files=[];
  function collect(directory,relative=""){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const absolute=path.join(directory,entry.name);
      const name=relative?relative+"/"+entry.name:entry.name;
      if(entry.isDirectory())collect(absolute,name);
      else if(entry.isFile())files.push({absolute,name:name.replace(/\\/g,"/")});
    }
  }
  collect(sourceDir);
  const localParts=[],centralParts=[];
  let offset=0;
  const now=new Date();
  const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(Math.floor(now.getSeconds()/2));
  const dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const file of files){
    const name=Buffer.from(file.name,"utf8");
    const raw=fs.readFileSync(file.absolute);
    const compressed=zlib.deflateRawSync(raw);
    const crc=crc32(raw);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(8,8);local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);
    local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
    localParts.push(local,name,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(dosTime,12);central.writeUInt16LE(dosDate,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);
    central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);
    central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
    centralParts.push(central,name);
    offset+=local.length+name.length+compressed.length;
  }
  const centralDirectory=Buffer.concat(centralParts);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(files.length,8);eocd.writeUInt16LE(files.length,10);
  eocd.writeUInt32LE(centralDirectory.length,12);eocd.writeUInt32LE(offset,16);eocd.writeUInt16LE(0,20);
  fs.writeFileSync(zipPath,Buffer.concat([...localParts,centralDirectory,eocd]));
}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function pngChunk(type,data){
  const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,crc]);
}
function makeIcon(seed,style="sword",colorTheme="ice"){
  const width=16,height=16,pixels=Buffer.alloc(width*height*4);
  let hash=0;for(const ch of seed)hash=(hash*31+ch.charCodeAt(0))>>>0;
  const palettes={
    ice:[70,175,235],
    fire:[235,82,45],
    emerald:[45,190,115],
    void:[160,90,230],
    gold:[235,185,55]
  };
  const base=palettes[colorTheme]||palettes.ice;
  const set=(x,y,color)=>{if(x<0||x>=width||y<0||y>=height)return;const i=(y*width+x)*4;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)set(x,y,[22,29,37]);
  if(style==="crystal"){
    for(let y=3;y<=12;y++){
      const half=Math.floor((y<=7?y-2:13-y)/2);
      for(let x=8-half;x<=8+half;x++)set(x,y,[base[0],base[1],base[2]]);
    }
    for(let y=4;y<=8;y++)set(8,y,[220,248,255]);
    for(let x=6;x<=10;x++)set(x,13,[170,220,245]);
    set(7,14,[170,220,245]);set(8,14,[170,220,245]);set(9,14,[170,220,245]);
  } else if(style==="orb"){
    for(let y=3;y<=12;y++)for(let x=3;x<=12;x++){
      const dx=x-7.5,dy=y-7.5;
      if(dx*dx+dy*dy<=23)set(x,y,[base[0],base[1],base[2]]);
    }
    set(5,5,[245,250,255]);set(6,5,[245,250,255]);set(5,6,[245,250,255]);
    set(9,10,[25,45,70]);set(7,13,[240,196,100]);set(8,13,[240,196,100]);
    set(7,14,[240,196,100]);set(8,14,[240,196,100]);
  } else {
    for(let i=0;i<8;i++){set(12-i,2+i,[210,242,255]);set(11-i,2+i,[120,207,244]);}
    for(let i=0;i<4;i++){set(5-i,10+i,[base[0],base[1],base[2]]);set(6-i,10+i,[base[0],base[1],base[2]]);}
    for(let x=3;x<9;x++)set(x,9,[240,196,100]);
    set(3,13,[190,140,90]);set(4,14,[190,140,90]);set(2,12,[190,140,90]);
  }
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++){raw[y*(1+width*4)]=0;pixels.copy(raw,y*(1+width*4)+1,y*width*4,(y+1)*width*4);}
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",header),pngChunk("IDAT",zlib.deflateSync(raw)),pngChunk("IEND",Buffer.alloc(0))]);
}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n","utf8");}
function createResourcePack(root,packName,itemId,itemName,description,packUuid,iconStyle="sword",colorTheme="ice"){
  const rp=path.join(root,"resource_pack");
  const moduleUuid=randomUUID();
  writeJson(path.join(rp,"manifest.json"),{
    format_version:2,
    header:{name:`${packName} RP`,description:"Zasoby wygenerowane przez AI Addon Studio",uuid:packUuid,version:[1,0,0],min_engine_version:[1,20,50]},
    modules:[{type:"resources",uuid:moduleUuid,version:[1,0,0]}]
  });
  fs.mkdirSync(path.join(rp,"texts"),{recursive:true});
  fs.writeFileSync(path.join(rp,"texts","languages.json"),JSON.stringify(["en_US","pl_PL"],null,2)+"\n");
  fs.writeFileSync(path.join(rp,"texts","en_US.lang"),`item.${itemId}.name=${itemName}\npack.name=${packName} RP\npack.description=Generated with AI Addon Studio\n`);
  fs.writeFileSync(path.join(rp,"texts","pl_PL.lang"),`item.${itemId}.name=${itemName}\npack.name=${packName} RP\npack.description=Zasoby wygenerowane przez AI Addon Studio\n`);
  const itemTexturesDir=path.join(rp,"textures","items");
  const itemTextureFile=path.join(itemTexturesDir,`${itemId}.png`);
  const iconBytes=makeIcon(itemId,iconStyle,colorTheme);
  // Twórz katalog bezpośrednio przed zapisem, żeby uniknąć ENOENT na Windows.
  fs.mkdirSync(itemTexturesDir,{recursive:true});
  fs.writeFileSync(itemTextureFile,iconBytes);
  if(!fs.existsSync(itemTextureFile))throw new Error(`Nie udało się utworzyć tekstury przedmiotu: ${itemTextureFile}`);
  writeJson(path.join(rp,"textures","item_texture.json"),{
    resource_pack_name:packName,
    texture_name:"atlas.items",
    texture_data:{[itemId]:{textures:`textures/items/${itemId}`}}
  });
  return rp;
}
function createBlockResourcePack(root,packName,blockId,blockName,description,packUuid,colorTheme="ice",blockSound="stone"){
  const rp=path.join(root,"resource_pack");
  writeJson(path.join(rp,"manifest.json"),{format_version:2,header:{name:packName+" Block RP",description:"Tekstury bloku wygenerowane przez AI Addon Studio",uuid:packUuid,version:[1,0,0],min_engine_version:[1,20,80]},modules:[{type:"resources",uuid:randomUUID(),version:[1,0,0]}]});
  fs.mkdirSync(path.join(rp,"texts"),{recursive:true});
  fs.writeFileSync(path.join(rp,"texts","languages.json"),JSON.stringify(["en_US","pl_PL"],null,2)+"\n");
  fs.writeFileSync(path.join(rp,"texts","en_US.lang"),"tile.studio:"+blockId+".name="+blockName+"\npack.name="+packName+" Block RP\npack.description=Generated with AI Addon Studio\n");
  fs.writeFileSync(path.join(rp,"texts","pl_PL.lang"),"tile.studio:"+blockId+".name="+blockName+"\npack.name="+packName+" Block RP\npack.description=Tekstura bloku wygenerowana przez AI Addon Studio\n");
  const blockDir=path.join(rp,"textures","blocks"); fs.mkdirSync(blockDir,{recursive:true});
  fs.writeFileSync(path.join(blockDir,blockId+".png"),makeIcon(blockId,"crystal",colorTheme));
  writeJson(path.join(rp,"textures","terrain_texture.json"),{resource_pack_name:packName,texture_name:"atlas.terrain",padding:8,num_mip_levels:4,texture_data:{[blockId]:{textures:"textures/blocks/"+blockId}}});
  writeJson(path.join(rp,"blocks.json"),{["studio:"+blockId]:{textures:blockId,sound:blockSound}});
  return rp;
}
function createBlockBehaviorPack(root,packName,blockId,blockName,description,rpUuid,options={}){
  const bp=path.join(root,"behavior_pack"),packUuid=randomUUID();
  writeJson(path.join(bp,"manifest.json"),{format_version:2,header:{name:packName+" Block BP",description:"Definicja bloku wygenerowana przez AI Addon Studio",uuid:packUuid,version:[1,0,0],min_engine_version:[1,20,80]},modules:[{type:"data",uuid:randomUUID(),version:[1,0,0]}],dependencies:[{uuid:rpUuid,version:[1,0,0]}]});
  writeJson(path.join(bp,"blocks",blockId+".json"),{format_version:"1.20.80","minecraft:block":{description:{identifier:"studio:"+blockId,menu_category:{category:"construction"}},components:{"minecraft:geometry":"minecraft:geometry.full_block","minecraft:material_instances":{"*":{texture:blockId,render_method:"opaque"}},"minecraft:collision_box":true,"minecraft:selection_box":true,"minecraft:light_emission":options.blockLight??0,"minecraft:friction":options.blockFriction??0.6,"minecraft:destructible_by_mining":{seconds_to_destroy:options.blockHardness??1.5},"minecraft:destructible_by_explosion":{explosion_resistance:options.explosionResistance??3}}}});
  fs.mkdirSync(path.join(bp,"texts"),{recursive:true});
  fs.writeFileSync(path.join(bp,"texts","README.txt"),"Pomysł: "+description+"\nBlok: studio:"+blockId+"\n\nWłącz Behavior Pack i Resource Pack w ustawieniach świata. Prototyp bloku wymaga testu w docelowej wersji Bedrock.\n");
  return bp;
}
function createBehaviorPack(root,packName,itemId,itemName,description,rpUuid,options={}){
  const recipeMaterial=options.recipeMaterial||"minecraft:iron_ingot";
  const allowedRecipeMaterials=new Set(["minecraft:iron_ingot","minecraft:gold_ingot","minecraft:diamond","minecraft:emerald","minecraft:slime_ball","minecraft:amethyst_shard"]);
  if(!allowedRecipeMaterials.has(recipeMaterial))throw new Error("Nieobsługiwany składnik receptury.");
  const bp=path.join(root,"behavior_pack"),packUuid=randomUUID();
  writeJson(path.join(bp,"manifest.json"),{
    format_version:2,
    header:{name:`${packName} BP`,description:"Zachowania wygenerowane przez AI Addon Studio",uuid:packUuid,version:[1,0,0],min_engine_version:[1,20,50]},
    modules:[{type:"data",uuid:randomUUID(),version:[1,0,0]}],
    dependencies:[{uuid:rpUuid,version:[1,0,0]}]
  });
  writeJson(path.join(bp,"items",`${itemId}.json`),{
    format_version:"1.20.50",
    "minecraft:item":{
      description:{identifier:`studio:${itemId}`,menu_category:{category:"equipment"}},
      components:{
        "minecraft:icon":{texture:itemId},
        "minecraft:display_name":{value:itemName},
        "minecraft:max_stack_size":options.stackSize??1,
        "minecraft:hand_equipped":true,
        "minecraft:damage":options.damage??7,
        "minecraft:rarity":{value:options.rarity??"common"},
        "minecraft:glint":options.glint===true,
        ...(options.durability > 0 ? {"minecraft:durability":{max_durability:options.durability}} : {})
      }
    }
  });
  writeJson(path.join(bp,"recipes",`${itemId}.json`),{
    format_version:"1.20.10",
    "minecraft:recipe_shapeless":{
      description:{identifier:`studio:craft_${itemId}`},
      tags:["crafting_table"],
      ingredients:[{item:recipeMaterial},{item:"minecraft:stick"}],
      result:{item:`studio:${itemId}`,count:options.recipeCount??1}
    }
  });
  fs.mkdirSync(path.join(bp,"texts"),{recursive:true});
  fs.writeFileSync(path.join(bp,"texts","README.txt"),`Pomysł: ${description}\nPrzedmiot: studio:${itemId}\n\nWłącz Behavior Pack i Resource Pack w ustawieniach świata.\n`);
  return bp;
}
async function buildExport(description,type,options={}){
  const itemName=displayName(description),itemId=safeName(itemName).slice(0,28)||"custom_item";
  if(type==="block"){
    const blockId=itemId.slice(0,24)||"custom_block",packName=safeName(itemName),root=path.join(os.tmpdir(),"ai-addon-"+randomUUID());
    fs.mkdirSync(root,{recursive:true}); const temporary=[];
    try{
      const rpUuid=randomUUID(); createBlockResourcePack(root,packName,blockId,itemName,description,rpUuid,options.colorTheme,options.blockSound); createBlockBehaviorPack(root,packName,blockId,itemName,description,rpUuid,options);
      const rpFile=path.join(root,packName+"-RP.mcpack"),bpFile=path.join(root,packName+"-BP.mcpack");
      await zipDirectory(path.join(root,"resource_pack"),rpFile); await zipDirectory(path.join(root,"behavior_pack"),bpFile);
      const container=path.join(root,"addon_container"); fs.mkdirSync(container); fs.copyFileSync(rpFile,path.join(container,packName+"-RP.mcpack")); fs.copyFileSync(bpFile,path.join(container,packName+"-BP.mcpack"));
      const output=path.join(os.tmpdir(),packName+"-"+randomUUID()+".mcaddon"); await zipDirectory(container,output); temporary.push(output);
      return {output,filename:packName+"-block.mcaddon",contentType:"application/octet-stream",cleanup:()=>{fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});}};
    }catch(error){fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});throw error;}
  }
  const packName=safeName(itemName),root=path.join(os.tmpdir(),`ai-addon-${randomUUID()}`);
  fs.mkdirSync(root,{recursive:true});
  const temporary=[];
  try{
    if(type==="resource_pack"){
      createResourcePack(root,packName,itemId,itemName,description,randomUUID(),options.iconStyle,options.colorTheme);
      const output=path.join(os.tmpdir(),`${packName}-${randomUUID()}.mcpack`);
      await zipDirectory(path.join(root,"resource_pack"),output);temporary.push(output);
      return {output,filename:`${packName}.mcpack`,contentType:"application/octet-stream",cleanup:()=>{fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});}};
    }
    const rpUuid=randomUUID();
    createResourcePack(root,packName,itemId,itemName,description,rpUuid,options.iconStyle,options.colorTheme);
    createBehaviorPack(root,packName,itemId,itemName,description,rpUuid,options);
    const rpFile=path.join(root,`${packName}-RP.mcpack`),bpFile=path.join(root,`${packName}-BP.mcpack`);
    await zipDirectory(path.join(root,"resource_pack"),rpFile);
    await zipDirectory(path.join(root,"behavior_pack"),bpFile);
    const container=path.join(root,"addon_container");fs.mkdirSync(container);
    fs.copyFileSync(rpFile,path.join(container,`${packName}-RP.mcpack`));
    fs.copyFileSync(bpFile,path.join(container,`${packName}-BP.mcpack`));
    const output=path.join(os.tmpdir(),`${packName}-${randomUUID()}.mcaddon`);
    await zipDirectory(container,output);temporary.push(output);
    return {output,filename:`${packName}.mcaddon`,contentType:"application/octet-stream",cleanup:()=>{fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});}};
  }catch(error){fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});throw error;}
}
function sendStatic(req,res){
  let urlPath;
  try{urlPath=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);}catch{return send(res,400,{error:"Nieprawidłowy adres."});}
  let relative=urlPath==="/"?"index.html":urlPath;
  while(relative.startsWith("/"))relative=relative.slice(1);
  const target=path.resolve(publicDir,relative),publicRoot=path.resolve(publicDir)+path.sep;
  if(!target.startsWith(publicRoot)&&target!==path.join(publicDir,"index.html"))return send(res,403,{error:"Forbidden"});
  fs.readFile(target,(err,data)=>{
    if(err)return send(res,404,"Nie znaleziono pliku.","text/plain; charset=utf-8");
    send(res,200,data,mime[path.extname(target)]||"application/octet-stream");
  });
}
const server=http.createServer(async(req,res)=>{
  if(req.method==="GET"&&req.url==="/api/status")return send(res,200,{ok:true,app:"AI Addon Studio",version:"0.4.16",node:process.version,aiConnected:false,mcpackExport:true,mcaddonExport:true,supportedTypes:["item","resource_pack","universal","block"]});
  if(req.method==="POST"&&req.url==="/api/export"){
    let result;
    try{
      const body=await readBody(req),description=String(body.description||"").trim(),type=String(body.type||"universal");
      if(description.length<5)return send(res,400,{error:"Wpisz opis (minimum 5 znaków)."});
      if(description.length>3000)return send(res,400,{error:"Opis może mieć maksymalnie 3000 znaków."});
      if(!new Set(["resource_pack","item","universal","block"]).has(type))return send(res,400,{error:"Ten rodzaj dodatku jest jeszcze w przygotowaniu. Działają przedmioty, bloki i paczki zasobów."});
      const damage=Math.max(1,Math.min(20,Math.round(Number(body.damage)||7)));
      const stackSize=Math.max(1,Math.min(64,Math.round(Number(body.stackSize)||1)));
      const recipeCount=Math.max(1,Math.min(4,Math.round(Number(body.recipeCount)||1)));
      const durability=Math.max(0,Math.min(1000,Math.round(Number(body.durability)||0)));
      const allowedRarities=new Set(["common","uncommon","rare","epic"]);
      const requestedRarity=String(body.rarity||"common");
      const rarity=allowedRarities.has(requestedRarity)?requestedRarity:"common";
      const allowedRecipeMaterials=new Set(["minecraft:iron_ingot","minecraft:gold_ingot","minecraft:diamond","minecraft:emerald","minecraft:slime_ball","minecraft:amethyst_shard"]);
      const requestedMaterial=String(body.recipeMaterial||"minecraft:iron_ingot");
      const recipeMaterial=allowedRecipeMaterials.has(requestedMaterial)?requestedMaterial:"minecraft:iron_ingot";
      const requestedIconStyle=String(body.iconStyle||"sword");
      const iconStyle=new Set(["sword","crystal","orb"]).has(requestedIconStyle)?requestedIconStyle:"sword";
      const requestedColorTheme=String(body.colorTheme||"ice");
      const colorTheme=new Set(["ice","fire","emerald","void","gold"]).has(requestedColorTheme)?requestedColorTheme:"ice";
      const blockHardness=Math.max(0.1,Math.min(10,Number(body.blockHardness)||1.5));
      const explosionValue=Number(body.explosionResistance);
      const explosionResistance=Math.max(0,Math.min(1200,Number.isFinite(explosionValue)&&body.explosionResistance!==""?explosionValue:3));
      const blockLightValue=Number(body.blockLight);
      const blockLight=Math.max(0,Math.min(15,Math.round(Number.isFinite(blockLightValue)&&body.blockLight!==""?blockLightValue:0)));
      const frictionValue=Number(body.blockFriction);
      const blockFriction=Math.max(0,Math.min(1,Number.isFinite(frictionValue)&&body.blockFriction!==""?frictionValue:0.6));
      const allowedBlockSounds=new Set(["stone","wood","glass","grass","metal"]);
      const requestedBlockSound=String(body.blockSound||"stone");
      const blockSound=allowedBlockSounds.has(requestedBlockSound)?requestedBlockSound:"stone";
      const glint=body.glint===true;
      result=await buildExport(description,type,{damage,stackSize,recipeMaterial,recipeCount,durability,rarity,glint,iconStyle,colorTheme,blockHardness,explosionResistance,blockLight,blockFriction,blockSound});
      const data=fs.readFileSync(result.output);
      result.cleanup();
      res.writeHead(200,{"Content-Type":result.contentType,"Content-Disposition":`attachment; filename="${result.filename}"`,"Content-Length":data.length,"X-Content-Type-Options":"nosniff"});
      return res.end(data);
    }catch(error){
      if(result?.cleanup)result.cleanup();
      return send(res,500,{error:`Eksport nie powiódł się: ${error.message}`});
    }
  }
  if(req.method==="GET"||req.method==="HEAD")return sendStatic(req,res);
  return send(res,405,{error:"Method not allowed"});
});
server.listen(port,"127.0.0.1",()=>console.log(`AI Addon Studio 0.4.16 działa: http://localhost:${port}`));
