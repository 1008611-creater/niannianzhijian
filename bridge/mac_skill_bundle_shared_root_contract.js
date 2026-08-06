'use strict';

const ALLOWED_UNMANAGED_TOP_LEVEL=Object.freeze(['.system','ai-brain-closeout','niannian-mac-production','post-coding-review']);

function assertManagedUnmanagedDisjoint(managedSkills,codePrefix){
  const unmanagedFolded=new Map();
  for(const name of ALLOWED_UNMANAGED_TOP_LEVEL){const key=name.toLocaleLowerCase('en-US');if(unmanagedFolded.has(key))throw new Error(codePrefix+'_allowlist_casefold_collision');unmanagedFolded.set(key,name);}
  const managedFolded=new Map();
  for(const name of managedSkills){const key=String(name).toLocaleLowerCase('en-US');if(managedFolded.has(key))throw new Error(codePrefix+'_managed_casefold_collision:'+managedFolded.get(key)+':'+name);if(unmanagedFolded.has(key))throw new Error(codePrefix+'_managed_unmanaged_conflict:'+name);managedFolded.set(key,name);}
  return true;
}

function classifyTopLevelNames(names,managedSkills,codePrefix,options={}){
  const entries=[...names],managed=[...managedSkills];
  assertManagedUnmanagedDisjoint(managed,codePrefix);
  if(entries.length!==new Set(entries).size)throw new Error(codePrefix+'_duplicate');
  const folded=new Map();
  for(const name of entries){const key=String(name).toLocaleLowerCase('en-US');if(folded.has(key)&&folded.get(key)!==name)throw new Error(codePrefix+'_casefold_collision:'+folded.get(key)+':'+name);folded.set(key,name);}
  const unknown=entries.filter(name=>!managed.includes(name)&&!ALLOWED_UNMANAGED_TOP_LEVEL.includes(name));
  const missing=managed.filter(name=>!entries.includes(name));
  if(unknown.length||(options.requireManagedPresent!==false&&missing.length))throw new Error(codePrefix+'_inventory_mismatch');
  return {managed_top_level_entries:managed.filter(name=>entries.includes(name)).sort(),unmanaged_top_level_entries:entries.filter(name=>ALLOWED_UNMANAGED_TOP_LEVEL.includes(name)).sort()};
}

module.exports={ALLOWED_UNMANAGED_TOP_LEVEL,assertManagedUnmanagedDisjoint,classifyTopLevelNames};
