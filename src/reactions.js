'use strict';
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// All are real GIF endpoints documented by nekos.best.
const CATEGORIES = Object.freeze({
 hug:'hug',kiss:'kiss',cuddle:'cuddle',handhold:'handhold',blowkiss:'blowkiss',pat:'pat',
 poke:'poke',wave:'wave',highfive:'highfive',tickle:'tickle',wink:'wink',laugh:'laugh',
 slap:'slap',bonk:'bonk',punch:'punch',kick:'kick',bite:'bite',yeet:'yeet',
 baka:'baka',angry:'angry'
});

function getHeaders(accept = 'application/json') {
    const userAgent = process.env.NYX_REACTION_USER_AGENT?.trim();

    if (!userAgent) {
        throw new Error(
            'NYX_REACTION_USER_AGENT is missing from .env'
        );
    }

    return {
        'User-Agent': userAgent,
        'Accept': accept
    };
}
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 14000;
async function getRandomReaction(type) {
 const category = CATEGORIES[type];
 if (!category) return null;
 const response = await fetch(
    `https://nekos.best/api/v2/${category}`,
    {
        headers: getHeaders('application/json'),
        signal: AbortSignal.timeout(7000)
    }
);
 if(!response.ok) throw Error(`Reaction API ${response.status}`);
 const url=(await response.json()).results?.[0]?.url;
 if(!url || !/^https:\/\/nekos\.best\/api\/v2\/[a-z]+\/[a-z0-9-]+\.gif(?:\?.*)?$/i.test(url)) throw Error('Invalid reaction asset URL');
 return url;
}
async function getGifBytes(url) {
 const response = await fetch(url, {
    headers: getHeaders('image/gif'),
    signal: AbortSignal.timeout(TIMEOUT_MS)
});
 if(!response.ok) throw Error(`Reaction download ${response.status}`);
 const length=Number(response.headers.get('content-length'));
 if(length>MAX_BYTES) throw Error('Reaction GIF too large');
 const chunks=[];let bytes=0;
 for await (const part of response.body) {bytes+=part.length;if(bytes>MAX_BYTES)throw Error('Reaction GIF exceeds limit');chunks.push(part);}
 const buffer=Buffer.concat(chunks);
 if(buffer.subarray(0,6).toString()!=='GIF89a'&&buffer.subarray(0,6).toString()!=='GIF87a')throw Error('Not a GIF');
 return buffer;
}
function convertGifToMp4(gifBuffer) {
 return new Promise((resolve,reject)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nyx-reaction-'));
  const input=path.join(dir,'in.gif'),output=path.join(dir,'out.mp4');
  fs.writeFileSync(input,gifBuffer);
  let done=false;
  const cleanup=()=>fs.rmSync(dir,{recursive:true,force:true});
  const ff=spawn(process.env.NYX_FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-vf','fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p','-movflags','+faststart','-an','-t','12',output],{stdio:['ignore','ignore','pipe']});
  let detail='';ff.stderr.on('data',d=>{detail+=String(d).slice(0,250)});
  const timer=setTimeout(()=>ff.kill('SIGKILL'),25000);
  const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);try{if(err)reject(err);else resolve(fs.readFileSync(output));}catch(e){reject(e);}finally{cleanup();}};
  ff.on('error',finish);ff.on('close',code=>finish(code===0?null:Error(`ffmpeg exited ${code}: ${detail}`)));
 });
}
async function whatsappReaction(type) {
 const gif=await getGifBytes(await getRandomReaction(type));
 return convertGifToMp4(gif);
}
module.exports={CATEGORIES,getRandomReaction,whatsappReaction};
