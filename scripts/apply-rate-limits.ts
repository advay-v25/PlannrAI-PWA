import fs from 'fs';
import path from 'path';

const filesToPatch = [
    {
        file: 'src/app/api/coach/proactive/route.ts',
        key: 'proactive',
        limit: 10,
        window: 300 // 5 mins
    },
    {
        file: 'src/app/api/goals/strategy/route.ts',
        key: 'strategy',
        limit: 5,
        window: 900 // 15 mins
    },
    {
        file: 'src/app/api/goals/decompose/route.ts',
        key: 'decompose',
        limit: 5,
        window: 900
    },
    {
        file: 'src/app/api/todos/dump/route.ts',
        key: 'brain-dump',
        limit: 15,
        window: 300
    },
    {
        file: 'src/app/api/narrative/briefing/route.ts',
        key: 'briefing',
        limit: 3,
        window: 3600 // 1 hour
    },
    {
        file: 'src/app/api/weekly-review/generate/route.ts',
        key: 'weekly-review',
        limit: 3,
        window: 3600
    },
    {
        file: 'src/app/api/weekly-review/generate-report/route.ts',
        key: 'weekly-report',
        limit: 3,
        window: 3600
    },
    {
        file: 'src/app/api/habit-stacks/assist/route.ts',
        key: 'habit-assist',
        limit: 10,
        window: 300
    },
    {
        file: 'src/app/api/calendar/generate-checklist/route.ts',
        key: 'generate-checklist',
        limit: 15,
        window: 300
    }
];

const basePath = path.join(__dirname, '..');

for (const p of filesToPatch) {
    const fullPath = path.join(basePath, p.file);
    if (!fs.existsSync(fullPath)) {
        console.warn('File not found:', p.file);
        continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');

    // Check if already patched
    if (content.includes('requireRateLimit')) {
        console.log('Already patched:', p.file);
        continue;
    }

    const patchCode = `
            // Rate Limit Check
            const { requireRateLimit } = await import('@/lib/rate-limit');
            const rateLimitCheck = await requireRateLimit(\`${p.key}:\${userId}\`, ${p.limit}, ${p.window});
            if (typeof rateLimitCheck !== 'boolean') return rateLimitCheck;
`;

    // Try to find the start of the try block inside secureApiRoute
    const tryMatch = content.match(/try\s*\{/);
    if (tryMatch) {
        const replaceIndex = tryMatch.index! + tryMatch[0].length;
        content = content.slice(0, replaceIndex) + patchCode + content.slice(replaceIndex);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Patched:', p.file);
    } else {
        console.warn('Could not find try block in:', p.file);
    }
}
