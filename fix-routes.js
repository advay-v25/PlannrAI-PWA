const fs = require('fs');

const limits = {
  'src/app/api/calendar/generate-today/route.ts': 'aiPlanDay',
  'src/app/api/calendar/optimize-day/route.ts': 'aiPlanDay',
  'src/app/api/ai/optimize-day/route.ts': 'aiPlanDay',
  'src/app/api/calendar/plan-week/route.ts': 'aiPlanWeek',
  'src/app/api/weekly-review/generate/route.ts': 'aiPlanWeek',
  'src/app/api/coach/apply/route.ts': 'aiCoach',
  'src/app/api/ai/execute/route.ts': 'aiCoach',
  'src/app/api/ai/morning-briefing/route.ts': 'aiCoach',
  'src/app/api/routines/generate/route.ts': 'aiPlanDay'
};

for (const [file, limit] of Object.entries(limits)) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Replace the very last `);` with `}, { rateLimit: 'LIMIT_NAME' });`
    // OR if it already has options, this might break, but none of these routes currently pass options.
    
    // First, let's just do a regex replace on `\n);` or `\n});` at the end of the file.
    if (content.endsWith(');\n')) {
        content = content.replace(/(\n}\s*);\n$/, `$1, { rateLimit: '${limit}' });\n`);
    } else if (content.endsWith(');')) {
        content = content.replace(/(\n}\s*);$/, `$1, { rateLimit: '${limit}' });`);
    } else {
        // Coach apply might be tricky
        console.log("Could not easily replace in", file);
    }
    fs.writeFileSync(file, content);
    console.log("Updated", file);
  }
}
