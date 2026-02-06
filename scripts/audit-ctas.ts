
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

interface CTAItem {
    file: string;
    line: number;
    element: string; // 'Button', 'a', 'div' (with onClick)
    label: string; // approximate text content
    handler: string; // name of handler or 'inline'
    api_calls: string[]; // potential API endpoints found in handler
    status: 'unknown';
}

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

async function scanFiles() {
    console.log('Scanning for CTAs in src/...');
    const files = await glob('src/**/*.{tsx,ts}', { cwd: ROOT_DIR, ignore: ['**/node_modules/**', '**/*.d.ts'] });

    const report: CTAItem[] = [];

    for (const file of files) {
        const absolutePath = path.join(ROOT_DIR, file);
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const lines = content.split('\n');

        // Regex for detecting Buttons and clickables
        // Very basic heuristic
        const buttonRegex = /<(Button|GlassButton|a|button|div)([^>]*?)>/g;

        let match;
        while ((match = buttonRegex.exec(content)) !== null) {
            const [fullTag, tagName, attributes] = match;

            // Check if it has onClick or href
            const hasOnClick = attributes.includes('onClick');
            const hasHref = attributes.includes('href');

            if (!hasOnClick && !hasHref && tagName === 'div') continue; // Skip divs without click

            // Calculate line number
            const matchingLineIndex = content.substring(0, match.index).split('\n').length;
            const lineContent = lines[matchingLineIndex - 1] || '';

            // Extract Label (roughly)
            let label = 'unknown';
            // Look ahead for content
            const contentAfterOpen = content.substring(match.index + fullTag.length, match.index + fullTag.length + 50);
            const textMatch = contentAfterOpen.match(/^([^<]+)/);
            if (textMatch) label = textMatch[1].trim();

            // Extract Handler name
            let handler = 'none';
            if (hasOnClick) {
                const handlerMatch = attributes.match(/onClick=\{([^}]+)\}/);
                if (handlerMatch) handler = handlerMatch[1];
            } else if (hasHref) {
                const hrefMatch = attributes.match(/href=["']([^"']+)["']/); // simplistic
                handler = hrefMatch ? `link:${hrefMatch[1]}` : 'link';
            }

            // Look for API calls in the file roughly related to this handler? 
            // Too hard for regex. Just listing file API calls is useful enough.

            report.push({
                file,
                line: matchingLineIndex,
                element: tagName,
                label: label.substring(0, 30),
                handler,
                api_calls: [], // Fill later if we get fancy
                status: 'unknown'
            });
        }
    }

    // Identify endpoints used in files
    const allEndpoints = new Set<string>();
    // ... logic to find fetch('/api/...')

    console.log(`Found ${report.length} potential CTAs.`);

    fs.writeFileSync(path.join(ROOT_DIR, 'cta_audit.json'), JSON.stringify(report, null, 2));
    console.log('Written to cta_audit.json');
}

scanFiles().catch(console.error);
