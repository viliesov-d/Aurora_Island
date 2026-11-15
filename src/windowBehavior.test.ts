import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTransitionGate, stableWindowGeometry } from './windowBehavior.ts';

test('duplicate open does not invalidate the pending open',()=>{
  const gate=createTransitionGate();
  const first=gate.begin(true)!;
  assert.equal(gate.begin(true),null);
  assert.equal(gate.finish(first),true);
  assert.equal(gate.pending,false);
});
test('closing cancels a pending open and stale completion cannot unlock the next open',()=>{
  const gate=createTransitionGate();
  const first=gate.begin(true)!;
  gate.begin(false);
  const next=gate.begin(true)!;
  assert.equal(gate.finish(first),false);
  assert.equal(gate.pending,true);
  assert.equal(gate.finish(next),true);
});
test('fixed viewport fits a small work area at 200% DPI',()=>{
  const rect=stableWindowGeometry(2,{x:0,y:0,width:568},{x:0,y:0,width:800,height:600});
  assert.equal(rect.width,400);
  assert.equal(rect.height,300);
});
test('restored negative monitor position stays on its work area',()=>{
  const rect=stableWindowGeometry(1.5,{x:-1500,y:950,width:852},{x:-1920,y:0,width:1920,height:1040});
  assert.equal(rect.x,-1500);
  assert.ok(rect.y+rect.height*1.5<=1040);
});
