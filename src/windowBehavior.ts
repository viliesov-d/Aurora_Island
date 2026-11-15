export function createTransitionGate() {
  let version=0;
  return {
    pending:false,
    begin(open:boolean):number|null {
      if(open&&this.pending)return null;
      this.pending=open;
      return ++version;
    },
    finish(token:number) {
      if(token!==version)return false;
      this.pending=false;
      return true;
    }
  };
}

type Rect={x:number;y:number;width:number;height:number};
export function stableWindowGeometry(scale:number,previous:Omit<Rect,'height'>,area:Rect) {
  const width=Math.min(568,area.width/scale);
  const height=Math.min(700,area.height/scale);
  return {width,height,
    x:Math.round(Math.max(area.x,Math.min(previous.x+(previous.width-width*scale)/2,area.x+area.width-width*scale))),
    y:Math.round(Math.max(area.y,Math.min(previous.y,area.y+area.height-height*scale)))
  };
}
