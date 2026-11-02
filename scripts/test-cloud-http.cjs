'use strict';
const assert = require('assert/strict');
const { cloudRequest, decodeCloudResponse } = require('../cloud-http');
async function main() {
  let calls = 0;
  const request = (responses, method='GET', route='archive/accounts') => cloudRequest({url:'https://fixture.invalid',route,method,delay:async()=>{},fetcher:async()=>{calls++;return responses.shift();}});
  const good = () => new Response(JSON.stringify({ok:true,data:[{id:'fixture'}]}));
  assert.deepEqual(await request([new Response(''),new Response('{"ok":'),good()]),[{id:'fixture'}]);assert.equal(calls,3);
  calls=0;await assert.rejects(request([new Response(''),new Response(''),new Response('')]),e=>e.status===502&&!e.message.includes('JSON'));assert.equal(calls,3);
  calls=0;await assert.rejects(request([new Response('',{status:401})]),e=>e.status===401);assert.equal(calls,1,'no retry for expired login');
  calls=0;await assert.rejects(request([new Response('')],'POST','archive/delete'));assert.equal(calls,1,'never replay destructive requests');
  calls=0;assert.deepEqual(await request([new Response(''),good()],'POST','archive/prepare'),[{id:'fixture'}]);assert.equal(calls,2);
  const raw=Buffer.from([0,255,32]);assert((await decodeCloudResponse(new Response(raw),true)).equals(raw));
  let current='owner-a';await assert.rejects(cloudRequest({url:'https://fixture.invalid',route:'archive/accounts',check:()=>{if(current!=='owner-a')throw Error('owner changed');},fetcher:async()=>{current='owner-b';return good();}}),/owner changed/);
  console.log('PASS: empty/truncated cloud responses retry safely, readable final error, no retry on authentication/deletion, exact binary bytes, owner isolation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
