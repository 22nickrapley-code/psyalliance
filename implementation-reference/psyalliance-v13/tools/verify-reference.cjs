#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'source-file-manifest.json'),'utf8'));
let bad=0;
for(const f of manifest.files){const p=path.join(root,f.package_path);if(!fs.existsSync(p)){console.error('MISSING',f.package_path);bad++;continue;}const bytes=fs.readFileSync(p),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==f.sha256||bytes.length!==f.size_bytes){console.error('CHANGED',f.package_path);bad++;}}
if(bad){console.error(`${bad} frozen-source mismatch(es). Restore the approved reference; do not redefine the baseline to match a redesign.`);process.exit(1);}
console.log(`Verified ${manifest.files.length} source files from version ${manifest.version_number}, commit ${manifest.commit_sha}.`);

