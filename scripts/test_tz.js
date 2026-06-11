const { parseISO, addDays, format } = require('date-fns');

const startParam = "2026-06-08";
const startDate = parseISO(startParam);
console.log("startDate:", startDate.toISOString());

const virtualBlocks = [];
for (let i = 0; i < 7; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const dayOfWeek = currentDate.getDay(); // 0 is Sunday
    virtualBlocks.push({ dateStr, dayOfWeek });
}
console.log(virtualBlocks);
