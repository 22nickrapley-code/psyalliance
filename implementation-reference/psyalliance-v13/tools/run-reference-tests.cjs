#!/usr/bin/env node
'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const check=spawnSync(process.execPath,[path.join(__dirname,'verify-reference.cjs')],{stdio:'inherit'});if(check.status!==0)process.exit(check.status||1);
const r=spawnSync(process.execPath,['tests/refinements.cjs'],{cwd:path.resolve(__dirname,'../reference'),stdio:'inherit'});if(r.error){console.error(r.error.message);process.exit(1);}if(r.status!==0){console.error('Reference test process did not complete successfully.',r.signal||'');process.exit(r.status||1);}process.exit(0);

