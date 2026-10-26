type CotProduction = { completed:number; assigned:number; c1:number; a1:number; c2:number; a2:number };

/** Official daily totals are authoritative; reject splits from a different source scope. */
export function allocateCotRemainder(values: CotProduction, primaryCot: string | null | undefined): CotProduction {
  if(values.a1+values.a2>values.assigned||values.c1+values.c2>values.completed||values.c1>values.a1||values.c2>values.a2){
    values={...values,a1:0,c1:0,a2:0,c2:0};
  }
  const cot=(primaryCot??"").replace(/\s/g,"").toUpperCase();
  const family=/^(?:COT)?1(?:\.[12])?$/.test(cot)?1:/^(?:COT)?2$/.test(cot)?2:null;
  if(family===null)return {...values};
  const assigned=Math.max(0,values.assigned-values.a1-values.a2);
  const completed=Math.max(0,values.completed-values.c1-values.c2);
  return family===1
    ? {...values,a1:values.a1+assigned,c1:values.c1+completed}
    : {...values,a2:values.a2+assigned,c2:values.c2+completed};
}
