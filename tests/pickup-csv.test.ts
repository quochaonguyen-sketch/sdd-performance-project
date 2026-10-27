import test from "node:test";
import assert from "node:assert/strict";
import { pickupCsvCell } from "../lib/pickup/csv.ts";

test("CSV preserves Vietnamese text and escapes quotes, commas and line breaks",()=>{
  assert.equal(pickupCsvCell('Shop "Mộc", Quận 3'),'"Shop ""Mộc"", Quận 3"');
  assert.equal(pickupCsvCell('Dòng 1\nDòng 2'),'"Dòng 1\nDòng 2"');
  assert.equal(pickupCsvCell(null),'""');
  assert.equal(pickupCsvCell('0'),'"0"');
});

test("external shop text cannot become a spreadsheet formula",()=>{
  for(const value of ['=1+1','+SUM(A1)','-2','@SUM(A1)','  =1+1','\t=1+1','\r=1+1']){
    assert.equal(pickupCsvCell(value),`"'${value}"`);
  }
});
