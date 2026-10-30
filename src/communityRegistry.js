'use strict';
const {db,withTransaction}=require('./database/connection');
const platforms=new Set(['whatsapp','discord']);
const now=()=>new Date().toISOString();
function validate(platform,id){
 if(!platforms.has(platform)||typeof id!=='string'||!id.trim())throw Error('Invalid community.');
 if(platform==='whatsapp'&&!id.endsWith('@g.us'))throw Error('Invalid WhatsApp group ID.');
 if(platform==='discord'&&!/^\d{15,22}$/.test(id))throw Error('Invalid Discord server ID.');
}
function convert(r){return r?{name:r.name,active:!!r.active,joinedAt:r.joined_at,updatedAt:r.updated_at}:null;}
const select=db.prepare('SELECT * FROM communities WHERE platform=? AND id=?');
function get(platform,id){validate(platform,id);return convert(select.get(platform,id));}
function isActive(platform,id){return get(platform,id)?.active===true;}
const discover=withTransaction((platform,id,name='')=>{
 validate(platform,id);
 const existing=get(platform,id);
 if(existing){if(name&&name!==existing.name)db.prepare('UPDATE communities SET name=? WHERE platform=? AND id=?').run(name,platform,id);return get(platform,id);}
 const timestamp=now();db.prepare('INSERT INTO communities(platform,id,name,active,joined_at,updated_at) VALUES (?,?,?,0,?,?)').run(platform,id,name||id,timestamp,timestamp);return get(platform,id);
});
const setActive=withTransaction((platform,id,active)=>{
 validate(platform,id);
 if(!get(platform,id))throw Error('Unknown community. AGU must discover or join it first.');
 db.prepare('UPDATE communities SET active=?,updated_at=? WHERE platform=? AND id=?').run(active?1:0,now(),platform,id);return get(platform,id);
});
const remove=withTransaction((platform,id)=>{validate(platform,id);return !!db.prepare('DELETE FROM communities WHERE platform=? AND id=?').run(platform,id).changes;});
function list(){const result={whatsapp:{},discord:{}};for(const r of db.prepare('SELECT * FROM communities').all())result[r.platform][r.id]=convert(r);return result;}
module.exports={discover,setActive,remove,get,isActive,list};
