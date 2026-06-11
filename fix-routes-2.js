const fs = require('fs');
const glob = require('glob');

const limits = {
  'src/app/api/habit-stacks/assist/route.ts': 'aiCoach',
  'src/app/api/todos/dump/route.ts': 'aiCoach',
  'src/app/api/goals/generate-strategy/route.ts': 'aiCoach',
  'src/app/api/goals/decompose/route.ts': 'aiCoach',
  'src/app/api/goals/strategy/route.ts': 'aiCoach',
  'src/app/api/calendar/generate-checklist/route.ts': 'aiCoach',
  'src/app/api/narrative/briefing/route.ts': 'aiCoach',
  'src/app/api/ai/suggest-goals/route.ts': 'aiCoach',
  'src/app/api/ai/optimize-habits/route.ts': 'aiCoach',
  'src/app/api/ai/intake/route.ts': 'aiCoach'
};

for (const [file, limit] of Object.entries(limits)) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // We want to replace `{ requireAuth: true }` with `{ requireAuth: true, rateLimit: 'LIMIT' }`
    // Or if it doesn't have options, append it.
    
    if (content.includes(`rateLimit: '`)) {
        console.log(`Already has rateLimit: ${file}`);
        continue;
    }

    if (content.match(/\{\s*requireAuth:\s*true\s*\}/)) {
        content = content.replace(/\{\s*requireAuth:\s*true\s*\}/g, `{ requireAuth: true, rateLimit: '${limit}' }`);
    } else {
        // If it doesn't have options at all, look for the closing of secureApiRoute
        if (content.endsWith(');\n')) {
            content = content.replace(/(\n}\s*);\n$/, `$1, { rateLimit: '${limit}' });\n`);
        } else if (content.endsWith(');')) {
            content = content.replace(/(\n}\s*);$/, `$1, { rateLimit: '${limit}' });`);
        }
    }
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}
