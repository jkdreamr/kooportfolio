import { it } from "vitest";
import { buildDetailLayer } from "../src/game/world/env/detail";
it("dbg", async () => { const size=64; for (let L=0;L<8;L++){ const d=await buildDetailLayer(L,size); const at=(x:number,y:number)=>d[(y*size+x)*4+1]; let su=0,sv=0,inn=0; for(let y=0;y<size;y++){su+=Math.abs(at(size-1,y)-at(0,y)); sv+=Math.abs(at(y,size-1)-at(y,0)); for(let x=1;x<size;x++) inn+=Math.abs(at(x,y)-at(x-1,y));} process.stderr.write("\n"+["L",L,(su/size).toFixed(1),(sv/size).toFixed(1),(inn/size/(size-1)).toFixed(1)].join(" ")); }
 for (const L of [0,1,2,3,4,5,6,7]) { const t=performance.now(); await buildDetailLayer(L,176); process.stderr.write("\n"+["T",L, (performance.now()-t).toFixed(1)].join(" ")); } });
