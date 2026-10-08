import { randomScramble, uniformRandomState } from "./dist/model/random.js";
import { MOVES } from "./dist/model/moves.js";
import { multiply, isSolved } from "./dist/model/cubie.js";
import { solveBeginner } from "./dist/solvers/beginner.js";
import { buildKociembaTables } from "./dist/solvers/kociemba.js";
buildKociembaTables();
let ok=0,tot=0,mx=0,mms=0;
for(let s=0;s<15;s++){
  const cube = s%2? uniformRandomState(s*17+3): randomScramble(25,s+1).cube;
  const res = solveBeginner(cube, {timeoutMs:20000});
  let c=cube; for(const m of res.solution) c=multiply(c,MOVES[m].cube);
  if(isSolved(c)&&res.solved) ok++; if(res.solved){tot+=res.solution.length; mx=Math.max(mx,res.solution.length);} mms=Math.max(mms,res.stats.timeMs);
  if(s<4) console.log("s",s,"len",res.solution.length,"solved",res.solved,"ms",res.stats.timeMs,"stageMoves",res.stages.map(x=>x.moves.length));
}
console.log("solved",ok,"/15 avg",(tot/Math.max(ok,1)).toFixed(1),"max",mx,"maxms",mms);
