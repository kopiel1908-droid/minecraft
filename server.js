import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
function zipDirectory(sourceDir, zipPath){
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
function makePack(description,type){
  const name=safeName(description.split(/[.!?\n]/)[0].slice(0,36));
  const dir=path.join(os.tmpdir(),`ai-addon-${randomUUID()}`);
  fs.mkdirSync(path.join(dir,"texts"),{recursive:true});
  const manifest={
    format_version:2,
    header:{name:description.slice(0,80)||"AI Addon Studio Resource Pack",description:`Bazowy projekt AI Addon Studio. Typ: ${type}.`,uuid:randomUUID(),version:[1,0,0],min_engine_version:[1,20,0]},
    modules:[{type:"resources",uuid:randomUUID(),version:[1,0,0]}]
  };
  fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest,null,2),"utf8");
  fs.writeFileSync(path.join(dir,"texts","languages.json"),JSON.stringify(["en_US"],null,2),"utf8");
  fs.writeFileSync(path.join(dir,"texts","en_US.lang"),`pack.name=${description.slice(0,80)||"My Addon"}\npack.description=Generated with AI Addon Studio\n`,"utf8");
  fs.writeFileSync(path.join(dir,"README.txt"),`Idea: ${description}\nType: ${type}\n\nThis is a base resource pack only. It does not yet contain generated models, textures, entities, items or behavior scripts.\n`,"utf8");
  return {dir,name};
}
function sendStatic(req,res){
  const urlPath=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);
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
  if(req.method==="GET"&&req.url==="/api/status")return send(res,200,{ok:true,app:"AI Addon Studio",version:"0.2.2",node:process.version,aiConnected:false,mcpackExport:true});
  if(req.method==="POST"&&req.url==="/api/export"){
    let dir,zipPath,mcpackPath;
    try{
      const body=await readBody(req),description=String(body.description||"").trim(),type=String(body.type||"universal");
      if(description.length<5)return send(res,400,{error:"Wpisz opis (minimum 5 znaków)."});
      if(description.length>3000)return send(res,400,{error:"Opis może mieć maksymalnie 3000 znaków."});
      if(!new Set(["resource_pack","item","mob","block","world","vehicle","universal"]).has(type))return send(res,400,{error:"Nieznany typ projektu."});
      const pack=makePack(description,type);dir=pack.dir;
      zipPath=path.join(os.tmpdir(),`${pack.name}-${randomUUID()}.zip`);
      mcpackPath=path.join(os.tmpdir(),`${pack.name}-${randomUUID()}.mcpack`);
      await zipDirectory(dir,zipPath);
      fs.copyFileSync(zipPath,mcpackPath);
      const data=fs.readFileSync(mcpackPath);
      fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(zipPath,{force:true});fs.rmSync(mcpackPath,{force:true});
      res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${pack.name}.mcpack"`,"Content-Length":data.length});
      return res.end(data);
    }catch(error){
      if(dir)fs.rmSync(dir,{recursive:true,force:true});
      if(zipPath)fs.rmSync(zipPath,{force:true});
      if(mcpackPath)fs.rmSync(mcpackPath,{force:true});
      return send(res,500,{error:`Eksport nie powiódł się: ${error.message}`});
    }
  }
  if(req.method==="GET"||req.method==="HEAD")return sendStatic(req,res);
  return send(res,405,{error:"Method not allowed"});
});
server.listen(port,"127.0.0.1",()=>console.log(`AI Addon Studio 0.2.2 działa: http://localhost:${port}`));
