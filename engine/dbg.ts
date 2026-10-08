import { randomScramble } from "./src/model/random.js";
import { MOVES } from "./src/model/moves.js";
import { multiply, isSolved } from "./src/model/cubie.js";
import { buildKociembaTables, solveKociemba } from "./src/solvers/kociemba.js";
buildKociembaTables();
for(let s=0;s<10;s++){
  const sc = randomScramble(25, s+1);
  const t=Date.now();
  const res = solveKociemba(sc.cube, {timeoutMs:8000});
  let c=sc.cube; for(const m of res.solution) c=multiply(c,MOVES[m].cube);
  console.log("s",s,"len",res.solution.length,"solved",isSolved(c),"ms",Date.now()-t,"nodes",res.stats.nodesExpanded);
}
