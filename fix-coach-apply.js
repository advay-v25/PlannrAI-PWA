const fs = require('fs');

let content = fs.readFileSync('src/app/api/coach/apply/route.ts', 'utf8');

const injection = `
        const { checkMultipleRateLimits, getClientIP, createRateLimitHeaders } = await import('@/lib/security/rate-limiter');
        const ip = getClientIP(request);
        const rateLimitResult = await checkMultipleRateLimits(ip, user.id, request.nextUrl.pathname, 'aiCoach');
        if (!rateLimitResult.allowed) {
            const retryAfter = rateLimitResult.retryAfter || 0;
            let errorMsg = 'Too many requests. Please slow down.';
            if (retryAfter > 0) {
                const days = Math.floor(retryAfter / (24 * 3600));
                const hours = Math.floor((retryAfter % (24 * 3600)) / 3600);
                const mins = Math.floor((retryAfter % 3600) / 60);
                let timeStr = [];
                if (days > 0) timeStr.push(\`\${days}d\`);
                if (hours > 0) timeStr.push(\`\${hours}h\`);
                if (mins > 0 || timeStr.length === 0) timeStr.push(\`\${mins}m\`);
                errorMsg = \`Daily Coach limit reached. Refreshes in \${timeStr.join(' ')}.\`;
            }
            const headers = createRateLimitHeaders(rateLimitResult);
            return new NextResponse(
                JSON.stringify({ error: { message: errorMsg }, retryAfter, resetAt: rateLimitResult.resetAt.toISOString() }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        ...Object.fromEntries(headers.entries()),
                    },
                }
            );
        }
`;

content = content.replace(
  'const { data: { user } } = await supabase.auth.getUser();',
  'const { data: { user } } = await supabase.auth.getUser();\n' +
  '        if (!user) return new NextResponse("Unauthorized", { status: 401 });\n' + injection
);

fs.writeFileSync('src/app/api/coach/apply/route.ts', content);
