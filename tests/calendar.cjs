const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('vercel-static/index.html', 'utf8');
for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
const context = vm.createContext({});
for (const name of ['taskDateKey', 'calendarTaskOnDate']) {
 const start = html.indexOf(`    function ${name}(`);
 const end = html.indexOf('\n    function ', start + 1);
 vm.runInContext(html.slice(start, end), context);
}
const on = context.calendarTaskOnDate;
const t = {startDate:'2026-09-29', date:'2026-10-02'};
for (const d of ['2026-09-29','2026-09-30','2026-10-01','2026-10-02']) assert.equal(on(t,d),true);
for (const d of ['2026-09-28','2026-10-03']) assert.equal(on(t,d),false);
assert.equal(on({date:'2026-09-12'},'2026-09-12'),true);
assert.equal(on({date:'2026-09-12'},'2026-09-11'),false);
assert.equal(on({},'2026-09-12'),false);
assert.equal(on({startDate:'2028-02-28',date:'2028-03-01'},'2028-02-29'),true);
console.log('PASS: inline JavaScript syntax; date ranges, boundaries, cross-month, leap day and legacy tasks');
