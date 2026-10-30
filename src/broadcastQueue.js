'use strict';
const crypto=require('crypto');
const {db,withTransaction}=require('./database/connection');
const registry=require('./communityRegistry');
const rowJob=r=>r?{id:r.id,message:r.message,tagAll:!!r.tag_all,createdAt:r.created_at,confirmed:!!r.confirmed,confirmedAt:r.confirmed_at||undefined,targets:db.prepare('SELECT platform,id FROM broadcast_targets WHERE job_id=?').all(r.id)}:null;
function getJob(id){if(!/^[a-f0-9]{16}$/.test(id))throw Error('Invalid broadcast ID');const r=db.prepare('SELECT * FROM broadcasts WHERE id=?').get(id);if(!r)throw Error('Broadcast not found.');return rowJob(r);}
function allJobs(){return db.prepare('SELECT * FROM broadcasts').all().map(rowJob);}
const preview=withTransaction((rawMessage,tagAll=false)=>{
 const message=String(rawMessage||'').trim();if(!message||message.length>1200||/[\u0000-\u0008]/.test(message))throw Error('Broadcast must be 1–1200 readable characters.');
 const all=registry.list();const targets=['whatsapp','discord'].flatMap(platform=>Object.entries(all[platform]||{}).filter(([,v])=>v.active).map(([id])=>({platform,id})));
 if(!targets.length)throw Error('No active communities.');
 const id=crypto.randomBytes(8).toString('hex');
 db.prepare('INSERT INTO broadcasts(id,message,tag_all,created_at) VALUES (?,?,?,?)').run(id,message,tagAll?1:0,new Date().toISOString());
 const add=db.prepare('INSERT INTO broadcast_targets(job_id,platform,id) VALUES (?,?,?)');for(const t of targets)add.run(id,t.platform,t.id);
 return getJob(id);
});
const confirm=withTransaction(id=>{const job=getJob(id);if(job.confirmed)throw Error('This broadcast was already confirmed.');if(Date.now()-Date.parse(job.createdAt)>600000)throw Error('Preview expired; create a new broadcast.');db.prepare('UPDATE broadcasts SET confirmed=1,confirmed_at=? WHERE id=?').run(new Date().toISOString(),id);return getJob(id);});
// Atomic claim across processes. A failed delivery remains recorded rather than being retried blindly.
const claim=withTransaction((jobId,platform,id)=>{
 const res=db.prepare("UPDATE broadcast_targets SET status='sending',claimed_at=? WHERE job_id=? AND platform=? AND id=? AND status='pending' AND EXISTS (SELECT 1 FROM broadcasts WHERE id=? AND confirmed=1)").run(Date.now(),jobId,platform,id,jobId);
 return res.changes===1;
});
function complete(jobId,platform,id,ok,details=''){
 db.prepare("UPDATE broadcast_targets SET status=?,completed_at=?,details=? WHERE job_id=? AND platform=? AND id=? AND status='sending'").run(ok?'sent':'failed',new Date().toISOString(),String(details).slice(0,200),jobId,platform,id);
}
function summary(job){return{job,rows:db.prepare('SELECT platform,id,status,details FROM broadcast_targets WHERE job_id=?').all(job.id)};}
module.exports={allJobs,getJob,preview,confirm,claim,complete,summary};
