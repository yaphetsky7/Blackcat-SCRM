const norm=value=>String(value||'').replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const decorated=value=>norm(value).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
function phone(value){const s=String(value||'');if(!/^\+?[\d\s().-]+$/.test(s))return'';const n=s.replace(/\D/g,'');return/^[1-9]\d{5,14}$/.test(n)?n:'';}
function username(value){const s=String(value||'').replace(/^@/,'');return/^[a-z0-9._-]{1,64}$/i.test(s)&&/[a-z]/i.test(s)?s:'';}
function resolveChatIdentity(platform,chat,accountContacts=[],personalContacts=[]){
 let p=phone(chat.phone),u=username(chat.username);const key=String(chat.key||chat.clientId||'').replace(/^(?:whatsapp|telegram|facebook|line):/,'');
 if(platform==='whatsapp'){p||=phone(key.match(/^(\d+)@(?:c\.us|s\.whatsapp\.net)$/)?.[1]);if(/^\+/.test(chat.title||''))p||=phone(chat.title);}
 if(/^@/.test(chat.title||''))u||=username(chat.title);
 if(platform==='telegram'){u||=username(key.match(/^#?@([a-z][a-z0-9_]{0,31})$/i)?.[1]);u||=username(String(chat.href||'').match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/([a-z][a-z0-9_]{0,31})(?:[?#]|$)/i)?.[1]);}
 if(chat.privateChat===false||/@(?:g\.us|broadcast)/.test(key)||platform==='telegram'&&/^#?-\d+$/.test(key))return{phone:'',username:u};
 for(const list of[accountContacts,personalContacts]){
   if(p&&u)break;let matches=list.filter(c=>norm(c.name)===norm(chat.title)||p&&phone(c.phone)===p||u&&norm(username(c.username))===norm(u));
   // Some platforms omit decorative emoji from the conversation header. Only
   // use a unique contact identity; never choose between two same-name people.
   if(!matches.length&&decorated(chat.title).length>=3)matches=list.filter(c=>decorated(c.name)===decorated(chat.title));
   const targets=new Set(matches.map(c=>phone(c.phone)||username(c.username).toLowerCase()).filter(Boolean));if(targets.size>1)break;if(!targets.size)continue;
   const phones=new Set(matches.map(c=>phone(c.phone)).filter(Boolean)),users=new Set(matches.map(c=>username(c.username)).filter(Boolean));if(phones.size===1)p||=[...phones][0];if(users.size===1)u||=[...users][0];break;
 }
 return{phone:p,username:u};
}
module.exports={resolveChatIdentity};
