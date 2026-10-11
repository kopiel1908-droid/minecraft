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
  return new Promise((resolve,reject)=>{
    const isWindows=process.platform==="win32";
    const command=isWindows?"powershell.exe":"tar";
    const args=isWindows
      ? ["-NoProfile","-NonInteractive","-Command",`Compress-Archive -Path '${sourceDir.replace(/'/g,"''")}\\*' -DestinationPath '${zipPath.replace(/'/g,"''")}' -Force`]
      : ["-a","-c","-f",zipPath,"-C",sourceDir,"."];
    const child=spawn(command,args,{windowsHide:true});
    let stderr="";
    child.stderr.on("data",chunk=>stderr+=chunk.toString());
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error(stderr||`ZIP error ${code}`)));
  });
}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function pngChunk(type,data){
  const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,crc]);
}
function makeIcon(seed){
  const width=16,height=16,pixels=Buffer.alloc(width*height*4);
  let hash=0;for(const ch of seed)hash=(hash*31+ch.charCodeAt(0))>>>0;
  const base=[45+(hash%45),100+((hash>>>7)%100),145+((hash>>>13)%90)];
  const set=(x,y,color)=>{if(x<0||x>=width||y<0||y>=height)return;const i=(y*width+x)*4;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)set(x,y,[22,29,37]);
  // Pixel-art sword icon: diagonal blade, guard and handle.
  for(let i=0;i<8;i++){set(12-i,2+i,[210,242,255]);set(11-i,2+i,[120,207,244]);}
  for(let i=0;i<4;i++){set(5-i,10+i,[base[0],base[1],base[2]]);set(6-i,10+i,[base[0],base[1],base[2]]);}
  for(let x=3;x<9;x++)set(x,9,[240,196,100]);
  set(3,13,[190,140,90]);set(4,14,[190,140,90]);set(2,12,[190,140,90]);
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++){raw[y*(1+width*4)]=0;pixels.copy(raw,y*(1+width*4)+1,y*width*4,(y+1)*width*4);}
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",header),pngChunk("IDAT",zlib.deflateSync(raw)),pngChunk("IEND",Buffer.alloc(0))]);
}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n","utf8");}
function createResourcePack(root,packName,itemId,itemName,description,packUuid){
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
  fs.mkdirSync(path.join(rp,"textures","items"),{recursive:true});
  fs.writeFileSync(path.join(rp,"textures","items",`${itemId}.png`),makeIcon(itemId));
  writeJson(path.join(rp,"textures","item_texture.json"),{
    resource_pack_name:packName,
    texture_name:"atlas.items",
    texture_data:{[itemId]:{textures:`textures/items/${itemId}`}}
  });
  return rp;
}
function createBehaviorPack(root,packName,itemId,itemName,description,rpUuid){
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
        "minecraft:max_stack_size":1,
        "minecraft:hand_equipped":true,
        "minecraft:damage":7
      }
    }
  });
  fs.mkdirSync(path.join(bp,"texts"),{recursive:true});
  fs.writeFileSync(path.join(bp,"texts","README.txt"),`Pomysł: ${description}\nPrzedmiot: studio:${itemId}\n\nWłącz Behavior Pack i Resource Pack w ustawieniach świata.\n`);
  return bp;
}
async function buildExport(description,type){
  const itemName=displayName(description),itemId=safeName(itemName).slice(0,28)||"custom_item";
  const packName=safeName(itemName),root=path.join(os.tmpdir(),`ai-addon-${randomUUID()}`);
  fs.mkdirSync(root,{recursive:true});
  const temporary=[];
  try{
    if(type==="resource_pack"){
      createResourcePack(root,packName,itemId,itemName,description,randomUUID());
      const output=path.join(os.tmpdir(),`${packName}-${randomUUID()}.mcpack`);
      await zipDirectory(path.join(root,"resource_pack"),output);temporary.push(output);
      return {output,filename:`${packName}.mcpack`,contentType:"application/octet-stream",cleanup:()=>{fs.rmSync(root,{recursive:true,force:true});for(const f of temporary)fs.rmSync(f,{force:true});}};
    }
    const rpUuid=randomUUID();
    createResourcePack(root,packName,itemId,itemName,description,rpUuid);
    createBehaviorPack(root,packName,itemId,itemName,description,rpUuid);
    const rpFile=path.join(root,`${packName}-RP.mcpack`),bpFile=path.join(root,`${packName}-BP.mcpack`);
    await zipDirectory(path.join(root,"resource_pack"),rpFile);
    await zipDirectory(path.join(root,"behavior_pack"),bpFile);
    const container=path.join(root,"addon_container");fs.mkdirSync(container);
    fs.cpSync(path.join(root,"resource_pack"),path.join(container,`${packName} RP`),{recursive:true});
    fs.cpSync(path.join(root,"behavior_pack"),path.join(container,`${packName} BP`),{recursive:true});
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
  if(req.method==="GET"&&req.url==="/api/status")return send(res,200,{ok:true,app:"AI Addon Studio",version:"0.4.0",node:process.version,aiConnected:false,mcpackExport:true,mcaddonExport:true,supportedTypes:["item","block","resource_pack","universal"]});
  if(req.method==="POST"&&req.url==="/api/export"){
    let result;
    try{
      const body=await readBody(req),description=String(body.description||"").trim(),type=String(body.type||"universal");
      if(description.length<5)return send(res,400,{error:"Wpisz opis (minimum 5 znaków)."});
      if(description.length>3000)return send(res,400,{error:"Opis może mieć maksymalnie 3000 znaków."});
      if(!new Set(["resource_pack","item","block","universal"]).has(type))return send(res,400,{error:"Ten rodzaj dodatku jest jeszcze w przygotowaniu. Działają przedmioty, proste bloki i paczki zasobów."});
      result=await buildExport(description,type);
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
server.listen(port,"127.0.0.1",()=>console.log(`AI Addon Studio 0.4.0 działa: http://localhost:${port}`));
