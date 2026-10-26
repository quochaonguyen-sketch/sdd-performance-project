type CotProduction = { completed:number; assigned:number; c1:number; a1:number; c2:number; a2:number };

/** Preserve observed splits; allocate only the remainder to the rider's main COT. */
export function allocateCotRemainder(values: CotProduction, primaryCot: string | null | undefined): CotProduction {
  const cot=(primaryCot??"").replace(/\s/g,"").toUpperCase();
  const family=/^(?:COT)?1(?:\.[12])?$/.test(cot)?1:/^(?:COT)?2$/.test(cot)?2:null;
  if(family===null)return {...values};
  const assigned=Math.max(0,values.assigned-values.a1-values.a2);
  const completed=Math.max(0,values.completed-values.c1-values.c2);
  return family===1
    ? {...values,a1:values.a1+assigned,c1:values.c1+completed}
    : {...values,a2:values.a2+assigned,c2:values.c2+completed};
}
