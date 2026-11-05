'use strict';
const {Worker,isMainThread,parentPort,workerData}=require('worker_threads');
function runTask(data){return new Promise((resolve,reject)=>{const w=new Worker(__filename,{workerData:data});let result,error;w.on('message',m=>{if(m.error)error=Error(m.error);else result=m.result;});w.once('error',reject);w.once('exit',code=>error?reject(error):code?reject(Error('本地工作资料备份未完成')):resolve(result));});}
if(!isMainThread)Promise.resolve().then(()=>require('./local-workspace-store')[workerData.action](workerData)).then(result=>parentPort.postMessage({result}),e=>parentPort.postMessage({error:e.message}));
module.exports={runTask};
