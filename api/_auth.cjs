const crypto=require('crypto');const {neon}=require('@neondatabase/serverless');
const sql=()=>neon(process.env.DATABASE_URL);
const cookie=(req,name)=>((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))||'').slice(name.length+1);
const valid=(req,name,role)=>{const t=cookie(req,name),s=process.env.ADMIN_SESSION_SECRET;if(!t||!s||!t.includes('.'))return null;const[p,sign]=t.split('.'),expected=crypto.createHmac('sha256',s).update(p).digest('base64url');if(sign!==expected)return null;try{const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.expires>Date.now()&&(role?v.role===role:true)?v:null}catch{return null}};
const body=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});module.exports={sql,cookie,valid,body};
