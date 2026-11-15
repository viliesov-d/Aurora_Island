import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { glassShape, morphEase } from './glassGeometry.ts';

test('compact and expanded lens align with the existing shell',()=>{
  assert.deepEqual(glassShape(540,676,280,24,0),{x:130,y:0,width:280,height:44,radius:22});
  assert.deepEqual(glassShape(540,676,280,24,1),{x:0,y:0,width:540,height:676,radius:32});
});
test('morph remains finite, monotonic and inside its canvas',()=>{
  let last=0;
  for(let i=0;i<=100;i++){
    const t=morphEase(i/100);
    assert.ok(t>=last&&t<=1);last=t;
    const r=glassShape(372,276,340,38,t);
    assert.ok(r.x>=0&&r.x+r.width<=372.001&&r.radius<=r.height/2);
  }
});
