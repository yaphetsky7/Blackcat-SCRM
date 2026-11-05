'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlackCatBackupPlatforms=api;})(globalThis,()=>{const platforms=Object.freeze(['whatsapp','telegram']);return Object.freeze({platforms,supports:value=>platforms.includes(typeof value==='string'?value:value?.platform)});});
