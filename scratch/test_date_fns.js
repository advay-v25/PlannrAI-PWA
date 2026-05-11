const { parse } = require('date-fns');
const d = parse('14:30:00', 'HH:mm', new Date());
console.log('Parsed date:', d);
console.log('IsValid:', !isNaN(d.getTime()));
